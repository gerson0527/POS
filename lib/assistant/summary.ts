import { calculateSaleTotals, formatCOP } from '@/lib/utils/pos-utils'
import type { ResolvedIntent } from './resolve'
import type { ConfirmationOption } from '@/lib/channels/types'
import type { CreateSaleIntent } from './intents'

function formatPayments(intent: CreateSaleIntent): string {
  if (intent.payments?.length) {
    return intent.payments
      .map((p) =>
        p.amount != null ? `${p.method} ${formatCOP(p.amount)}` : `${p.method} (resto)`
      )
      .join(' + ')
  }
  return intent.paymentMethod
}

/** Resumen legible para el canal. */
export function buildSummary(resolved: ResolvedIntent): string {
  const { intent, products, customer, openCashSession, blockers, notices, stockLevels } =
    resolved

  if (intent.type === 'CLARIFY') {
    return `Necesito aclarar:\n${intent.question}`
  }
  if (intent.type === 'UNSUPPORTED') {
    return `No puedo hacer eso por este canal:\n${intent.reason}`
  }

  const noticeBlock =
    notices?.length > 0 ? ['⚠️ Avisos:', ...notices.map((n) => `• ${n}`), ''].join('\n') : ''

  const ambiguousProduct = products.find((p) => p.status === 'ambiguous')
  if (ambiguousProduct) {
    return [
      noticeBlock,
      `Varios productos coinciden con "${ambiguousProduct.query}". Elija uno:`,
      ...(ambiguousProduct.candidates || []).map(
        (c, i) => `${i + 1}. ${c.name} (SKU ${c.sku})`
      ),
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (customer.status === 'ambiguous') {
    return [
      noticeBlock,
      'Varios clientes coinciden. Elija uno:',
      ...(customer.candidates || []).map(
        (c, i) => `${i + 1}. ${c.name} — ${c.documentNumber}`
      ),
    ]
      .filter(Boolean)
      .join('\n')
  }

  // Solo falta el cliente (productos OK): mensaje dedicado + botón CF
  if (
    intent.type === 'CREATE_SALE' &&
    customer.status === 'none' &&
    products.every((p) => p.status === 'matched') &&
    blockers.every((b) => /Indique el cliente/i.test(b) || /turno de caja/i.test(b))
  ) {
    const lines = products
      .filter((p) => p.product)
      .map((p) => `• ${p.quantity} × ${p.product!.name}`)
    return [
      noticeBlock,
      '📋 *Productos listos — falta el cliente*',
      ...lines,
      '',
      'Escriba `cliente 1234567890` o pulse *Consumidor final*.',
      openCashSession
        ? null
        : '⚠️ No hay turno de caja abierto; ábralo en el POS antes de confirmar.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (blockers.length) {
    return [
      noticeBlock,
      'No puedo continuar todavía:',
      ...blockers.map((b) => `• ${b}`),
      '',
      'Corrija el mensaje o complete lo faltante e intente de nuevo.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (intent.type === 'STOCK_QUERY') {
    const p = products[0]
    if (!p?.product) return 'No encontré el producto.'
    const levels = stockLevels || []
    if (!levels.length) {
      return `📦 ${p.product.name} (SKU ${p.product.sku})\nSin existencias registradas en ninguna sede.`
    }
    return [
      `📦 *${p.product.name}* (SKU ${p.product.sku})`,
      ...levels.map(
        (l) => `• ${l.locationName}: ${l.quantity} (disp. ${l.available})`
      ),
    ].join('\n')
  }

  if (intent.type === 'CREATE_SALE') {
    const lines = products
      .filter((p) => p.product)
      .map((p) => {
        const unit = Number(p.product!.unitPrice)
        const line = p.quantity * unit
        return `• ${p.quantity} × ${p.product!.name} @ ${formatCOP(unit)} = ${formatCOP(line)}`
      })
    const totals = calculateSaleTotals(
      products
        .filter((p) => p.product)
        .map((p) => ({
          quantity: p.quantity,
          unitPrice: Number(p.product!.unitPrice),
          ivaRate: Number(p.product!.ivaRate),
        }))
    )
    const customerLine =
      customer.status === 'matched' && customer.customer
        ? `${customer.customer.name} (${customer.customer.documentNumber})`
        : 'CONSUMIDOR FINAL'
    return [
      noticeBlock,
      '📋 *Borrador de factura*',
      `Cliente: ${customerLine}`,
      `Pago: ${formatPayments(intent)}`,
      `Caja: ${openCashSession?.locationName || openCashSession?.locationId || '—'}`,
      '',
      ...lines,
      '',
      `Subtotal: ${formatCOP(totals.subtotal)}`,
      `IVA: ${formatCOP(totals.taxAmount)}`,
      `*Total: ${formatCOP(totals.total)}*`,
      '',
      'Confirme para registrar la venta (requiere turno de caja abierto).',
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (
    intent.type === 'INVENTORY_IN' ||
    intent.type === 'INVENTORY_OUT' ||
    intent.type === 'INVENTORY_ADJUSTMENT'
  ) {
    const label =
      intent.type === 'INVENTORY_IN'
        ? 'Entrada'
        : intent.type === 'INVENTORY_OUT'
          ? 'Salida'
          : 'Ajuste'
    const lines = products
      .filter((p) => p.product)
      .map((p) => `• ${label}: ${p.quantity} × ${p.product!.name} (SKU ${p.product!.sku})`)
    return [
      `📦 *Borrador de movimiento* (${label})`,
      ...lines,
      intent.reason ? `Motivo: ${intent.reason}` : null,
      '',
      'Confirme para aplicar el movimiento en inventario.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return 'No entendí la solicitud.'
}

/**
 * Botones inline. callback_data ≤ 64 bytes (Telegram).
 * - pp = pick product by candidate index
 * - pc = pick customer by candidate index
 * - cf = consumidor final
 * - confirm / cancel
 */
export function buildDraftOptions(
  draftId: string,
  resolved: ResolvedIntent
): ConfirmationOption[] | undefined {
  const ambiguousLine = resolved.products.findIndex((p) => p.status === 'ambiguous')
  if (ambiguousLine >= 0) {
    const line = resolved.products[ambiguousLine]
    return (line.candidates || []).slice(0, 5).map((c, idx) => ({
      label: c.name.slice(0, 40),
      data: `pp:${draftId}:${ambiguousLine}:${idx}`,
    }))
  }

  if (resolved.customer.status === 'ambiguous' && resolved.customer.candidates) {
    return resolved.customer.candidates.slice(0, 5).map((c, idx) => ({
      label: `${c.name}`.slice(0, 40),
      data: `pc:${draftId}:${idx}`,
    }))
  }

  if (
    resolved.intent.type === 'CREATE_SALE' &&
    resolved.customer.status === 'none' &&
    resolved.products.every((p) => p.status === 'matched')
  ) {
    const opts: ConfirmationOption[] = [
      { label: '👤 Consumidor final', data: `cf:${draftId}` },
      { label: '❌ Cancelar', data: `cancel:${draftId}` },
    ]
    return opts
  }

  if (resolved.blockers.length) return undefined
  if (
    resolved.intent.type === 'CREATE_SALE' ||
    resolved.intent.type === 'INVENTORY_IN' ||
    resolved.intent.type === 'INVENTORY_OUT' ||
    resolved.intent.type === 'INVENTORY_ADJUSTMENT'
  ) {
    return [
      { label: '✅ Confirmar', data: `confirm:${draftId}` },
      { label: '❌ Cancelar', data: `cancel:${draftId}` },
    ]
  }
  return undefined
}
