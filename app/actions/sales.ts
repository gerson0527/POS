'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import {
  CreateSaleDTO,
  CompleteSaleDTO,
  GenerateInvoiceDTO,
  SaleStatus,
  AuditAction,
  EventType
} from '@/lib/types'
import { formatInvoiceNumber } from '@/lib/utils/pos-utils'
import { ALL_ROLES } from '@/lib/auth/permissions'
import { INTERNAL_NUMERATION } from '@/lib/fiscal/numeration'
import { and, eq, lt, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import {
  getUserId,
  getTenantId,
  logAudit,
  publishEvent,
  requireRole,
  requireActor,
} from './_shared'
import {
  SALE_ROLES,
  createSale as createSaleForActor,
  completeSale as completeSaleForActor,
} from '@/lib/sales/service'
import { safeAction } from './_result'

export async function createSale(input: CreateSaleDTO) {
  return safeAction(
    () => createSaleInternal(input),
    'No se pudo crear la venta. Verifica que la caja esté abierta e intenta de nuevo.'
  )
}

async function createSaleInternal(input: CreateSaleDTO) {
  const actor = await requireActor([...SALE_ROLES])
  const result = await createSaleForActor(actor, input)
  revalidatePath('/pos')
  return { ...result, success: true as const }
}

export async function getSale(saleId: string) {
  const userId = await getUserId()
  await requireRole(userId, ALL_ROLES)
  const tenantId = await getTenantId(userId)

  const sale = await db
    .select()
    .from(schema.sale)
    .where(and(eq(schema.sale.id, saleId), eq(schema.sale.tenantId, tenantId)))
    .limit(1)

  if (!sale.length) throw new Error('Sale not found')

  const items = await db.select().from(schema.saleItem).where(eq(schema.saleItem.saleId, saleId))

  return { ...sale[0], items }
}

// PAYMENT & COMPLETION
export async function completeSale(input: CompleteSaleDTO) {
  return safeAction(
    () => completeSaleInternal(input),
    'No se pudo completar la venta. Verifica el turno de caja e intenta de nuevo.'
  )
}

async function completeSaleInternal(input: CompleteSaleDTO) {
  const actor = await requireActor([...SALE_ROLES])
  const completed = await completeSaleForActor(actor, input)
  revalidatePath('/pos')
  return { success: true as const, ...completed }
}

// INVOICE GENERATION
async function getOrCreateInternalNumeration(tenantId: string) {
  const find = () =>
    db
      .select()
      .from(schema.numeration)
      .where(
        and(
          eq(schema.numeration.tenantId, tenantId),
          eq(schema.numeration.resolution, INTERNAL_NUMERATION.resolution),
          eq(schema.numeration.prefix, INTERNAL_NUMERATION.prefix)
        )
      )
      .limit(1)

  const existing = await find()
  if (existing[0]) {
    // REC es infraestructura del POS: si quedó inactiva o con tipo erróneo
    // (p. ej. al activar otro DOCUMENTO_EQUIVALENTE_POS), se repara sola.
    const needsRepair =
      existing[0].status !== 'ACTIVE' ||
      existing[0].documentType !== INTERNAL_NUMERATION.documentType
    if (needsRepair) {
      const repaired = await db
        .update(schema.numeration)
        .set({
          status: 'ACTIVE',
          documentType: INTERNAL_NUMERATION.documentType,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.numeration.id, existing[0].id),
            eq(schema.numeration.tenantId, tenantId)
          )
        )
        .returning()
      if (!repaired[0]) {
        throw new Error('No se pudo reactivar la numeración interna del POS.')
      }
      return repaired[0]
    }
    return existing[0]
  }

  const id = `num_internal_${randomUUID()}`
  await db
    .insert(schema.numeration)
    .values({
      id,
      tenantId,
      resolution: INTERNAL_NUMERATION.resolution,
      prefix: INTERNAL_NUMERATION.prefix,
      startRange: INTERNAL_NUMERATION.startRange,
      endRange: INTERNAL_NUMERATION.endRange,
      currentNumber: INTERNAL_NUMERATION.startRange - 1,
      documentType: INTERNAL_NUMERATION.documentType,
      status: 'ACTIVE',
    })
    .onConflictDoNothing()

  const created = await find()
  if (!created[0]) throw new Error('No se pudo crear la numeración interna del POS.')
  return created[0]
}

export async function generateInvoice(input: GenerateInvoiceDTO) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER', 'CASHIER'])
  const tenantId = await getTenantId(userId)

  const sale = await db
    .select()
    .from(schema.sale)
    .where(and(eq(schema.sale.id, input.saleId), eq(schema.sale.tenantId, tenantId)))
    .limit(1)

  if (!sale.length) throw new Error('Sale not found')
  if (sale[0].status !== SaleStatus.COMPLETED) throw new Error('Sale must be completed')

  const existingDocs = await db
    .select()
    .from(schema.fiscalDocument)
    .where(and(eq(schema.fiscalDocument.saleId, input.saleId), eq(schema.fiscalDocument.tenantId, tenantId)))

  // La numeración electrónica la asigna Factus: si ya hay CUFE, no se consume
  // ningún consecutivo interno ni se reescribe el documento oficial.
  const existingElectronic = existingDocs.find((doc) => doc.uniqueCode)
  if (existingElectronic?.uniqueCode) {
    return {
      invoiceId: existingElectronic.id,
      cufe: existingElectronic.uniqueCode,
      invoiceNumber: existingElectronic.fullNumber,
      success: true,
    }
  }

  // El comprobante interno REC es un documento SEPARADO de la factura
  // electrónica: nunca se sobrescribe con el número fiscal de Factus.
  const existingDoc = existingDocs.find(
    (doc) =>
      doc.documentType === INTERNAL_NUMERATION.documentType &&
      doc.prefix === INTERNAL_NUMERATION.prefix
  )

  // Idempotencia del comprobante interno: si ya existe uno pendiente, se reutiliza.
  if (existingDoc?.fullNumber && existingDoc.prefix === INTERNAL_NUMERATION.prefix) {
    return {
      invoiceId: existingDoc.id,
      invoiceNumber: existingDoc.fullNumber,
      success: true,
    }
  }

  const num = await getOrCreateInternalNumeration(tenantId)

  const result = await db.transaction(async (tx) => {
    // Reserva atómica del consecutivo: una sola sentencia evita duplicados por
    // lectura/escritura concurrente. Si currentNumber ya llegó a endRange no
    // devuelve fila y se reporta el agotamiento.
    const updated = await tx
      .update(schema.numeration)
      .set({
        currentNumber: sql`GREATEST(${schema.numeration.currentNumber} + 1, ${schema.numeration.startRange})`,
      })
      .where(
        and(
          eq(schema.numeration.id, num.id),
          lt(schema.numeration.currentNumber, schema.numeration.endRange)
        )
      )
      .returning({ currentNumber: schema.numeration.currentNumber })

    if (!updated.length) {
      throw new Error(`Numeración ${num.prefix} agotada. Rango final: ${num.endRange}`)
    }

    // currentNumber es bigint en la BD: pg lo devuelve como string.
    const nextNumber = Number(updated[0].currentNumber)
    const invoiceNumber = formatInvoiceNumber(num.prefix, nextNumber)
    const invoiceId = existingDoc?.id ?? `fdoc_${randomUUID()}`
    const saleRow = sale[0]

    if (!existingDoc) {
      await tx.insert(schema.fiscalDocument).values({
        id: invoiceId,
        tenantId,
        branchId: saleRow.locationId || 'main_branch',
        saleId: input.saleId,
        documentType: INTERNAL_NUMERATION.documentType,
        status: 'PENDING_GENERATION',
        prefix: num.prefix,
        consecutive: String(nextNumber),
        fullNumber: invoiceNumber,
        issueDate: new Date(),
        issueTime: new Date().toLocaleTimeString('es-CO'),
        correlationId: `corr_${randomUUID()}`,
        issuerSnapshot: { tenantId },
        customerSnapshot: {
          documentType: saleRow.customerDocType,
          documentNumber: saleRow.customerDocNumber,
          name: saleRow.customerName,
          email: saleRow.customerEmail,
          phone: saleRow.customerPhone,
          address: saleRow.customerAddress,
        },
        totalsSnapshot: {
          subtotal: saleRow.subtotal,
          taxAmount: saleRow.taxAmount,
          total: saleRow.total,
        },
        paymentSnapshot: [],
      })
    } else {
      await tx
        .update(schema.fiscalDocument)
        .set({
          documentType: INTERNAL_NUMERATION.documentType,
          prefix: num.prefix,
          consecutive: String(nextNumber),
          fullNumber: invoiceNumber,
        })
        .where(eq(schema.fiscalDocument.id, existingDoc.id))
    }

    return { invoiceId, invoiceNumber }
  })

  await logAudit(tenantId, userId, AuditAction.CREATE, 'invoice', result.invoiceId, {
    invoiceNumber: result.invoiceNumber,
  })
  await publishEvent(tenantId, EventType.INVOICE_GENERATED, 'invoice', result.invoiceId, {
    invoiceNumber: result.invoiceNumber,
  })

  revalidatePath('/pos')
  return { ...result, success: true }
}

