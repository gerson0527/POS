import { AuditAction, PaymentMethod } from '@/lib/types'
import type { ActorContext } from '@/lib/auth/actor'
import { logAudit } from '@/lib/audit/log'
import { createSale, completeSale } from '@/lib/sales/service'
import {
  recordInventoryMovement,
  resolveMovementLocation,
  type ManualMovementType,
} from '@/lib/inventory/service'
import { calculateSaleTotals, formatCOP, roundToNearest100 } from '@/lib/utils/pos-utils'
import type { ResolvedIntent } from './resolve'
import { claimDraft, markDraftDone, markDraftFailed } from './drafts'
import { canHandleIntent, permissionDeniedMessage } from './permissions'
import type { TenantRole } from '@/lib/auth/session-context'

function mapPaymentMethod(raw: string): PaymentMethod {
  const key = String(raw || 'CASH').toUpperCase()
  const values = Object.values(PaymentMethod) as string[]
  if (values.includes(key)) return key as PaymentMethod
  if (key === 'CARD') return PaymentMethod.CREDIT_CARD
  return PaymentMethod.CASH
}

/** Reparte el total entre uno o varios medios (amount omitido = remanente). */
function splitPayments(
  intent: Extract<ResolvedIntent['intent'], { type: 'CREATE_SALE' }>,
  total: number
): Array<{ method: PaymentMethod; amount: number }> {
  const splits = intent.payments?.length
    ? intent.payments
    : [{ method: intent.paymentMethod, amount: undefined as number | undefined }]

  let allocated = 0
  const withAmounts: Array<{ method: PaymentMethod; amount: number | null }> = []
  for (const s of splits) {
    if (s.amount != null && Number.isFinite(s.amount) && s.amount > 0) {
      const amt = roundToNearest100(s.amount)
      withAmounts.push({ method: mapPaymentMethod(s.method), amount: amt })
      allocated += amt
    } else {
      withAmounts.push({ method: mapPaymentMethod(s.method), amount: null })
    }
  }

  const remainder = Math.max(0, roundToNearest100(total - allocated))
  const open = withAmounts.filter((p) => p.amount == null)
  if (open.length === 0) {
    if (Math.abs(allocated - total) > 1) {
      // Ajuste en el último tramo si no cuadró
      const last = withAmounts[withAmounts.length - 1]
      last.amount = Math.max(100, roundToNearest100((last.amount || 0) + (total - allocated)))
    }
  } else if (open.length === 1) {
    open[0].amount = remainder > 0 ? remainder : 100
  } else {
    // Varios sin monto: el primero se lleva el remanente; el resto mínimo 100 y se rebalancea
    open[0].amount = Math.max(100, remainder - (open.length - 1) * 100)
    for (let i = 1; i < open.length; i++) open[i].amount = 100
  }

  const payments = withAmounts.map((p) => ({
    method: p.method,
    amount: p.amount as number,
  }))
  const sum = payments.reduce((a, p) => a + p.amount, 0)
  if (Math.abs(sum - total) > 1 && payments.length) {
    payments[payments.length - 1].amount = Math.max(
      100,
      roundToNearest100(payments[payments.length - 1].amount + (total - sum))
    )
  }
  return payments.filter((p) => p.amount > 0)
}

function inventoryType(
  intentType: ResolvedIntent['intent']['type']
): ManualMovementType {
  if (intentType === 'INVENTORY_IN') return 'IN'
  if (intentType === 'INVENTORY_OUT') return 'OUT'
  return 'ADJUSTMENT'
}

export async function executeConfirmedDraft(params: {
  actor: ActorContext
  draftId: string
  channelMessageId?: string | null
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const claimed = await claimDraft({
    tenantId: params.actor.tenantId,
    userId: params.actor.userId,
    draftId: params.draftId,
  })
  if (!claimed) {
    return {
      ok: false,
      message: 'El borrador no está disponible (ya se usó, expiró o fue cancelado).',
    }
  }

  const resolved = claimed.resolvedJson as ResolvedIntent
  if (!resolved?.intent) {
    await markDraftFailed(claimed.id, 'Borrador sin datos resueltos.')
    return { ok: false, message: 'Borrador inválido.' }
  }

  if (!canHandleIntent(params.actor.role, resolved.intent)) {
    const msg = permissionDeniedMessage(resolved.intent.type, params.actor.role)
    await markDraftFailed(claimed.id, msg)
    return { ok: false, message: msg }
  }

  if (resolved.blockers?.length) {
    const msg = resolved.blockers.join(' ')
    await markDraftFailed(claimed.id, msg)
    return { ok: false, message: msg }
  }

  try {
    let resultRef = ''
    let message = ''

    if (resolved.intent.type === 'CREATE_SALE') {
      const outcome = await executeSale(params.actor, resolved)
      resultRef = outcome.saleId
      message = outcome.message
    } else if (
      resolved.intent.type === 'INVENTORY_IN' ||
      resolved.intent.type === 'INVENTORY_OUT' ||
      resolved.intent.type === 'INVENTORY_ADJUSTMENT'
    ) {
      const outcome = await executeInventory(params.actor, resolved, claimed.id)
      resultRef = outcome.ids.join(',')
      message = outcome.message
    } else {
      await markDraftFailed(claimed.id, 'Tipo de intención no ejecutable.')
      return { ok: false, message: 'Esa intención no se ejecuta con confirmación.' }
    }

    await markDraftDone(claimed.id, resultRef)
    await logAudit(
      params.actor.tenantId,
      params.actor.userId,
      AuditAction.ASSISTANT_EXECUTE,
      'assistant_draft',
      claimed.id,
      {
        intent: resolved.intent.type,
        resultRef,
        channelMessageId: params.channelMessageId ?? claimed.channelMessageId,
        extracted: claimed.extractedJson,
        summary: claimed.summary,
      }
    )
    return { ok: true, message }
  } catch (err: any) {
    const msg = err?.message || 'Error al ejecutar el borrador.'
    await markDraftFailed(claimed.id, msg)
    return { ok: false, message: msg }
  }
}

async function executeSale(actor: ActorContext, resolved: ResolvedIntent) {
  const intent = resolved.intent
  if (intent.type !== 'CREATE_SALE') throw new Error('Intención inválida.')
  if (!resolved.openCashSession) {
    throw new Error('No hay turno de caja abierto. Abra caja en el POS.')
  }

  const matched = resolved.products.filter((p) => p.status === 'matched' && p.product)
  if (!matched.length) throw new Error('No hay productos resueltos.')

  if (resolved.customer.status === 'none') {
    throw new Error('Falta el cliente. Indique cédula o use Consumidor Final.')
  }

  const customer =
    resolved.customer.status === 'matched' && resolved.customer.customer
      ? {
          documentType: resolved.customer.customer.documentType,
          documentNumber: resolved.customer.customer.documentNumber,
          name: resolved.customer.customer.name,
          email: resolved.customer.customer.email || undefined,
          phone: resolved.customer.customer.phone || undefined,
          address: resolved.customer.customer.address || undefined,
        }
      : undefined // final_consumer → createSale/build-bill usan Consumidor Final

  const created = await createSale(actor, {
    locationId: resolved.openCashSession.locationId,
    items: matched.map((p) => ({
      productId: p.product!.id,
      quantity: p.quantity,
    })),
    customer,
    notes: intent.notes || 'Venta vía asistente',
    allowWithoutStock: intent.allowWithoutStock,
  })

  const totals = calculateSaleTotals(
    matched.map((p) => ({
      quantity: p.quantity,
      unitPrice: Number(p.product!.unitPrice),
      ivaRate: Number(p.product!.ivaRate),
    }))
  )
  const amount = roundToNearest100(totals.total)
  const payments = splitPayments(intent, amount).map((p) => ({
    ...p,
    reference: `assistant:${created.saleId}`,
  }))

  const completed = await completeSale(actor, {
    saleId: created.saleId,
    payments,
  })

  const fiscalPart = completed.fiscal?.cufe
    ? ` CUFE: ${completed.fiscal.cufe}`
    : completed.fiscal?.success === false
      ? ` Fiscal pendiente: ${completed.fiscal.message}`
      : completed.transmissionMode === 'MANUAL'
        ? ' Factura en cola (modo MANUAL).'
        : ''

  return {
    saleId: created.saleId,
    message:
      `✅ Venta #${completed.ticketNumber ?? created.ticketNumber} por ${formatCOP(completed.total)}.` +
      fiscalPart,
  }
}

async function executeInventory(
  actor: ActorContext,
  resolved: ResolvedIntent,
  draftId: string
) {
  const intent = resolved.intent
  if (
    intent.type !== 'INVENTORY_IN' &&
    intent.type !== 'INVENTORY_OUT' &&
    intent.type !== 'INVENTORY_ADJUSTMENT'
  ) {
    throw new Error('Intención inválida.')
  }

  const locationId = await resolveMovementLocation(
    actor,
    resolved.openCashSession?.locationId
  )
  const movementType = inventoryType(intent.type)
  const matched = resolved.products.filter((p) => p.status === 'matched' && p.product)
  if (!matched.length) throw new Error('No hay productos resueltos.')

  const ids: string[] = []
  const lines: string[] = []
  for (const [index, line] of matched.entries()) {
    const qty =
      movementType === 'ADJUSTMENT' ? line.quantity : Math.abs(line.quantity)
    const result = await recordInventoryMovement(actor, {
      productId: line.product!.id,
      locationId,
      movementType,
      quantity: qty,
      reason: intent.reason || (movementType === 'ADJUSTMENT' ? 'Asistente' : null),
      notes: intent.notes || null,
      idempotencyKey: `${draftId}:${index}:${line.product!.id}`,
      source: 'ASSISTANT',
    })
    ids.push(result.id)
    lines.push(
      `• ${line.product!.name}: ${result.duplicated ? 'ya aplicado' : `${result.previousQuantity} → ${result.newQuantity}`}`
    )
  }

  return {
    ids,
    message: `✅ Movimiento de inventario aplicado:\n${lines.join('\n')}`,
  }
}

export function actorFromLink(link: {
  tenantId: string
  userId: string
  role: TenantRole
}): ActorContext {
  return { tenantId: link.tenantId, userId: link.userId, role: link.role }
}
