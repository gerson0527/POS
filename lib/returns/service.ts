// Servicio de dominio de devoluciones a cliente.
//
// Alcance deliberado: SOLO operación interna del sistema. No crea ni transmite
// facturas electrónicas, notas crédito DIAN ni eventos fiscales. La operación
// normal es devolución de producto (`refundMethod = NONE`): la factura original
// no se modifica y solo entra stock. Cada devolución deja estos movimientos:
//   - inventario: entrada por producto (movementType RETURN)
//   - caja: DEVOLUCION solo si el reembolso es en efectivo (afecta el arqueo Z)
//   - cartera: abono a la cuenta del cliente solo si el reembolso es a crédito
//   - auditoría y evento de dominio
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import {
  AuditAction,
  EventType,
  SaleStatus,
  type CreateCustomerReturnDTO,
  type RefundMethod,
} from '@/lib/types'
import { assertActorRole, type ActorContext } from '@/lib/auth/actor'
import { logAudit, publishEvent } from '@/lib/audit/log'
import { getBogotaBusinessDate } from '@/lib/utils/business-date'
import {
  calculateReturn,
  roundReturnMoney,
  type ReturnCalculationLine,
} from './calculate'
import { REFUND_METHODS } from './constants'

export { REFUND_METHODS }
export { REFUND_METHOD_LABELS } from './constants'

export const RETURN_ROLES = ['ADMIN', 'MANAGER', 'CASHIER'] as const
export const RETURN_READ_ROLES = ['ADMIN', 'MANAGER', 'CASHIER', 'VIEWER'] as const

export interface CreateCustomerReturnResult {
  returnId: string
  saleId: string
  returnNumber: number
  returnNumberLabel: string
  total: number
  refundMethod: RefundMethod
}

export interface ReturnableSaleItem {
  id: string
  productId: string
  productName: string | null
  sku: string | null
  quantity: number
  unitPrice: number
  ivaRate: number
  ivaAmount: number
  lineTotal: number
  returnedQuantity: number
  remainingQuantity: number
}

export interface ReturnableSale {
  id: string
  ticketNumber: number | null
  invoiceNumber: string | null
  status: string
  total: number
  subtotal: number
  taxAmount: number
  createdAt: string
  customerName: string | null
  customerDocNumber: string | null
  locationId: string
  locationName: string | null
  returnedTotal: number
  returnableTotal: number
  isFullyReturned: boolean
  items: ReturnableSaleItem[]
  payments: Array<{ id: string; method: string; amount: number; status: string }>
  previousReturns: Array<{
    id: string
    returnNumber: number
    total: number
    refundMethod: string
    createdAt: string
  }>
}

export interface CustomerReturnListRow {
  id: string
  returnNumber: number
  returnNumberLabel: string
  saleId: string
  saleTicketNumber: number | null
  customerName: string | null
  customerDocNumber: string | null
  reason: string
  subtotal: number
  taxAmount: number
  total: number
  refundMethod: RefundMethod
  refundReference: string | null
  status: string
  itemCount: number
  unitCount: number
  userName: string | null
  createdAt: string
}

export interface CustomerReturnDetail extends CustomerReturnListRow {
  notes: string | null
  invoiceNumber: string | null
  locationId: string
  locationName: string | null
  cashierSessionId: string | null
  cashMovementId: string | null
  creditTransactionId: string | null
  userEmail: string | null
  company: {
    legalName: string
    nit: string | null
    tradeName: string | null
    address: string | null
    city: string | null
  } | null
  items: Array<{
    id: string
    saleItemId: string
    productId: string
    productName: string | null
    sku: string | null
    quantity: number
    unitPrice: number
    ivaRate: number
    ivaAmount: number
    lineTotal: number
  }>
}

export function formatReturnNumber(returnNumber: number): string {
  return `DEV-${String(returnNumber).padStart(4, '0')}`
}

function assertRefundMethod(value: string): RefundMethod {
  const method = String(value || '').trim().toUpperCase() as RefundMethod
  if (!REFUND_METHODS.includes(method)) {
    throw new Error('Medio de reembolso inválido.')
  }
  return method
}

function normalizeReason(value: string | undefined): string {
  const reason = String(value || '').trim()
  if (!reason) return 'Devolución de producto'
  if (reason.length < 5) {
    throw new Error('Registre el motivo de la devolución (mínimo 5 caracteres).')
  }
  if (reason.length > 500) {
    throw new Error('El motivo no puede superar 500 caracteres.')
  }
  return reason
}

export async function searchReturnableSales(
  actor: ActorContext,
  query: string
): Promise<Array<{
  id: string
  ticketNumber: number | null
  invoiceNumber: string | null
  itemCount: number
  total: number
  returnedTotal: number
  returnableTotal: number
  isFullyReturned: boolean
  customerName: string | null
  customerDocNumber: string | null
  createdAt: string
}>> {
  assertActorRole(actor, [...RETURN_READ_ROLES])
  const { tenantId } = actor

  const conditions: any[] = [
    eq(schema.sale.tenantId, tenantId),
    eq(schema.sale.status, SaleStatus.COMPLETED),
  ]

  const term = query.trim()
  if (term) {
    const digits = term.replace(/\D/g, '')
    const searchParts: any[] = [
      ilike(schema.sale.customerName, `%${term}%`),
      ilike(schema.sale.customerDocNumber, `%${term}%`),
      ilike(schema.fiscalDocument.fullNumber, `%${term}%`),
      eq(schema.sale.id, term),
    ]
    if (digits) {
      searchParts.push(eq(schema.sale.ticketNumber, Number(digits)))
    }
    conditions.push(or(...searchParts))
  }

  const sales = await db
    .select({
      id: schema.sale.id,
      ticketNumber: schema.sale.ticketNumber,
      invoiceNumber: schema.fiscalDocument.fullNumber,
      documentType: schema.fiscalDocument.documentType,
      total: schema.sale.total,
      customerName: schema.sale.customerName,
      customerDocNumber: schema.sale.customerDocNumber,
      createdAt: schema.sale.createdAt,
    })
    .from(schema.sale)
    .leftJoin(
      schema.fiscalDocument,
      and(
        eq(schema.fiscalDocument.saleId, schema.sale.id),
        eq(schema.fiscalDocument.tenantId, tenantId),
        sql`${schema.fiscalDocument.documentType} IN ('FACTURA_ELECTRONICA_VENTA', 'DOCUMENTO_EQUIVALENTE_POS')`
      )
    )
    .where(and(...conditions))
    .orderBy(desc(schema.sale.createdAt))
    .limit(15)

  const saleIds = sales.map((sale) => sale.id)
  const itemCounts = new Map<string, number>()
  if (saleIds.length) {
    const counts = await db
      .select({
        saleId: schema.saleItem.saleId,
        count: sql<number>`count(*)`,
      })
      .from(schema.saleItem)
      .where(inArray(schema.saleItem.saleId, saleIds))
      .groupBy(schema.saleItem.saleId)
    counts.forEach((row) => itemCounts.set(row.saleId, Number(row.count || 0)))
  }
  const returnedBySale = new Map<string, number>()
  if (saleIds.length) {
    const prior = await db
      .select({
        saleId: schema.customerReturn.saleId,
        total: sql<string>`coalesce(sum(${schema.customerReturn.total}), 0)`,
      })
      .from(schema.customerReturn)
      .where(
        and(
          eq(schema.customerReturn.tenantId, tenantId),
          eq(schema.customerReturn.status, 'COMPLETED'),
          inArray(schema.customerReturn.saleId, saleIds)
        )
      )
      .groupBy(schema.customerReturn.saleId)
    prior.forEach((row) => returnedBySale.set(row.saleId, Number(row.total || 0)))
  }

  // Una venta puede tener varios documentos fiscales; se conserva uno solo,
  // priorizando la factura electrónica sobre el documento equivalente POS.
  const uniqueSales = new Map<string, (typeof sales)[number]>()
  for (const sale of sales) {
    const existing = uniqueSales.get(sale.id)
    if (!existing) {
      uniqueSales.set(sale.id, sale)
      continue
    }
    if (!existing.invoiceNumber && sale.invoiceNumber) {
      uniqueSales.set(sale.id, sale)
    }
  }

  return Array.from(uniqueSales.values()).map((sale) => {
    const total = roundReturnMoney(Number(sale.total || 0))
    const returnedTotal = roundReturnMoney(returnedBySale.get(sale.id) ?? 0)
    const returnableTotal = Math.max(0, roundReturnMoney(total - returnedTotal))
    return {
      id: sale.id,
      ticketNumber: sale.ticketNumber,
      invoiceNumber: sale.invoiceNumber,
      itemCount: itemCounts.get(sale.id) ?? 0,
      total,
      returnedTotal,
      returnableTotal,
      isFullyReturned: returnableTotal <= 0,
      customerName: sale.customerName,
      customerDocNumber: sale.customerDocNumber,
      createdAt: sale.createdAt ? new Date(sale.createdAt).toISOString() : '',
    }
  })
}

export async function getReturnableSale(
  actor: ActorContext,
  saleId: string
): Promise<ReturnableSale> {
  assertActorRole(actor, [...RETURN_READ_ROLES])
  const { tenantId } = actor

  const saleRows = await db
    .select()
    .from(schema.sale)
    .where(and(eq(schema.sale.id, saleId), eq(schema.sale.tenantId, tenantId)))
    .limit(1)
  const sale = saleRows[0]
  if (!sale) throw new Error('Venta no encontrada.')
  if (sale.status !== SaleStatus.COMPLETED) {
    throw new Error('Solo se pueden devolver ventas completadas.')
  }

  const itemRows = await db
    .select({
      id: schema.saleItem.id,
      productId: schema.saleItem.productId,
      productName: schema.product.name,
      sku: schema.product.sku,
      quantity: schema.saleItem.quantity,
      unitPrice: schema.saleItem.unitPrice,
      ivaRate: schema.saleItem.ivaRate,
      ivaAmount: schema.saleItem.ivaAmount,
      lineTotal: schema.saleItem.lineTotal,
    })
    .from(schema.saleItem)
    .leftJoin(schema.product, eq(schema.saleItem.productId, schema.product.id))
    .where(eq(schema.saleItem.saleId, saleId))

  const priorQuantityRows = await db
    .select({
      saleItemId: schema.customerReturnItem.saleItemId,
      quantity: sql<string>`coalesce(sum(${schema.customerReturnItem.quantity}), 0)`,
    })
    .from(schema.customerReturnItem)
    .innerJoin(
      schema.customerReturn,
      eq(schema.customerReturn.id, schema.customerReturnItem.returnId)
    )
    .where(
      and(
        eq(schema.customerReturn.tenantId, tenantId),
        eq(schema.customerReturn.saleId, saleId),
        eq(schema.customerReturn.status, 'COMPLETED')
      )
    )
    .groupBy(schema.customerReturnItem.saleItemId)

  const returnedByItem = new Map(
    priorQuantityRows.map((row) => [row.saleItemId, Number(row.quantity || 0)])
  )

  const previousReturns = await db
    .select({
      id: schema.customerReturn.id,
      returnNumber: schema.customerReturn.returnNumber,
      total: schema.customerReturn.total,
      refundMethod: schema.customerReturn.refundMethod,
      createdAt: schema.customerReturn.createdAt,
    })
    .from(schema.customerReturn)
    .where(
      and(
        eq(schema.customerReturn.tenantId, tenantId),
        eq(schema.customerReturn.saleId, saleId),
        eq(schema.customerReturn.status, 'COMPLETED')
      )
    )
    .orderBy(desc(schema.customerReturn.createdAt))

  const payments = await db
    .select({
      id: schema.payment.id,
      method: schema.payment.method,
      amount: schema.payment.amount,
      status: schema.payment.status,
    })
    .from(schema.payment)
    .where(eq(schema.payment.saleId, saleId))

  const locationRows = await db
    .select({ name: schema.location.name })
    .from(schema.location)
    .where(eq(schema.location.id, sale.locationId))
    .limit(1)

  const fiscalRows = await db
    .select({
      fullNumber: schema.fiscalDocument.fullNumber,
      documentType: schema.fiscalDocument.documentType,
    })
    .from(schema.fiscalDocument)
    .where(
      and(
        eq(schema.fiscalDocument.saleId, saleId),
        eq(schema.fiscalDocument.tenantId, tenantId),
        sql`${schema.fiscalDocument.fullNumber} IS NOT NULL`
      )
    )
  const invoiceNumber =
    fiscalRows.find((row) => row.documentType === 'FACTURA_ELECTRONICA_VENTA')?.fullNumber ??
    fiscalRows[0]?.fullNumber ??
    null

  const items: ReturnableSaleItem[] = itemRows.map((item) => {
    const quantity = Number(item.quantity || 0)
    const returnedQuantity = Math.min(quantity, returnedByItem.get(item.id) ?? 0)
    return {
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      quantity: roundReturnMoney(quantity),
      unitPrice: Number(item.unitPrice || 0),
      ivaRate: Number(item.ivaRate || 0),
      ivaAmount: Number(item.ivaAmount || 0),
      lineTotal: Number(item.lineTotal || 0),
      returnedQuantity: roundReturnMoney(returnedQuantity),
      remainingQuantity: Math.max(0, roundReturnMoney(quantity - returnedQuantity)),
    }
  })

  const total = roundReturnMoney(Number(sale.total || 0))
  const returnedTotal = roundReturnMoney(
    previousReturns.reduce((sum, row) => sum + Number(row.total || 0), 0)
  )
  const returnableTotal = Math.max(0, roundReturnMoney(total - returnedTotal))

  return {
    id: sale.id,
    ticketNumber: sale.ticketNumber,
    invoiceNumber,
    status: sale.status,
    total,
    subtotal: Number(sale.subtotal || 0),
    taxAmount: Number(sale.taxAmount || 0),
    createdAt: sale.createdAt ? new Date(sale.createdAt).toISOString() : '',
    customerName: sale.customerName,
    customerDocNumber: sale.customerDocNumber,
    locationId: sale.locationId,
    locationName: locationRows[0]?.name || null,
    returnedTotal,
    returnableTotal,
    isFullyReturned: returnableTotal <= 0,
    items,
    payments: payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      amount: Number(payment.amount || 0),
      status: payment.status,
    })),
    previousReturns: previousReturns.map((row) => ({
      id: row.id,
      returnNumber: row.returnNumber,
      total: Number(row.total || 0),
      refundMethod: row.refundMethod,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    })),
  }
}

export async function createCustomerReturn(
  actor: ActorContext,
  input: CreateCustomerReturnDTO
): Promise<CreateCustomerReturnResult> {
  assertActorRole(actor, [...RETURN_ROLES])
  const { userId, tenantId } = actor

  if (!input?.saleId) throw new Error('Debe indicar la venta a devolver.')
  if (!input.items?.length) throw new Error('Seleccione al menos un producto para devolver.')
  const reason = normalizeReason(input.reason)
  // Por defecto la devolución es solo de producto: no mueve dinero.
  const refundMethod = input.refundMethod ? assertRefundMethod(input.refundMethod) : 'NONE'
  const notes = input.notes?.trim() || null
  if (notes && notes.length > 500) throw new Error('Las notas no pueden superar 500 caracteres.')
  const refundReference = input.refundReference?.trim() || null
  if (refundReference && refundReference.length > 160) {
    throw new Error('La referencia del reembolso no puede superar 160 caracteres.')
  }

  const result = await db.transaction(async (tx) => {
    // Serializa la asignación de consecutivo de devoluciones por tenant.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:customer-return`}))`
    )

    const saleRows = await tx
      .select()
      .from(schema.sale)
      .where(
        and(eq(schema.sale.id, input.saleId), eq(schema.sale.tenantId, tenantId))
      )
      .limit(1)
      .for('update')
    const sale = saleRows[0]
    if (!sale) throw new Error('Venta no encontrada.')
    if (sale.status !== SaleStatus.COMPLETED) {
      throw new Error('Solo se pueden devolver ventas completadas.')
    }

    const saleItems = await tx
      .select()
      .from(schema.saleItem)
      .where(eq(schema.saleItem.saleId, sale.id))
    if (!saleItems.length) throw new Error('La venta no tiene productos.')

    const priorItemRows = await tx
      .select({
        saleItemId: schema.customerReturnItem.saleItemId,
        quantity: sql<string>`coalesce(sum(${schema.customerReturnItem.quantity}), 0)`,
      })
      .from(schema.customerReturnItem)
      .innerJoin(
        schema.customerReturn,
        eq(schema.customerReturn.id, schema.customerReturnItem.returnId)
      )
      .where(
        and(
          eq(schema.customerReturn.tenantId, tenantId),
          eq(schema.customerReturn.saleId, sale.id),
          eq(schema.customerReturn.status, 'COMPLETED')
        )
      )
      .groupBy(schema.customerReturnItem.saleItemId)

    const priorTotalRows = await tx
      .select({
        total: sql<string>`coalesce(sum(${schema.customerReturn.total}), 0)`,
      })
      .from(schema.customerReturn)
      .where(
        and(
          eq(schema.customerReturn.tenantId, tenantId),
          eq(schema.customerReturn.saleId, sale.id),
          eq(schema.customerReturn.status, 'COMPLETED')
        )
      )

    const calculation = calculateReturn({
      saleTotal: Number(sale.total || 0),
      saleItems: saleItems.map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
        ivaRate: Number(item.ivaRate || 0),
        ivaAmount: Number(item.ivaAmount || 0),
        lineTotal: Number(item.lineTotal || 0),
      })),
      requestedItems: input.items,
      alreadyReturned: priorItemRows.map((row) => ({
        saleItemId: row.saleItemId,
        quantity: Number(row.quantity || 0),
      })),
      previousReturnTotal: Number(priorTotalRows[0]?.total || 0),
    })

    const numberRows = await tx
      .select({
        maxNumber: sql<number>`coalesce(max(${schema.customerReturn.returnNumber}), 0)`,
      })
      .from(schema.customerReturn)
      .where(eq(schema.customerReturn.tenantId, tenantId))
    const returnNumber = Number(numberRows[0]?.maxNumber || 0) + 1
    const returnNumberLabel = formatReturnNumber(returnNumber)
    const returnId = `ret_${randomUUID()}`

    let cashierSessionId: string | null = null
    let cashMovementId: string | null = null
    let creditTransactionId: string | null = null

    if (refundMethod === 'CASH') {
      const sessionRows = await tx
        .select({ id: schema.cashierSession.id })
        .from(schema.cashierSession)
        .where(
          and(
            eq(schema.cashierSession.tenantId, tenantId),
            eq(schema.cashierSession.userId, userId),
            eq(schema.cashierSession.status, 'OPEN'),
            eq(schema.cashierSession.businessDate, getBogotaBusinessDate())
          )
        )
        .orderBy(desc(schema.cashierSession.openedAt))
        .limit(1)
        .for('update')

      const session = sessionRows[0]
      if (!session) {
        throw new Error(
          'No hay una caja abierta para hoy. Abra su turno de caja para reembolsar en efectivo.'
        )
      }
      cashierSessionId = session.id
      cashMovementId = `cm_${randomUUID()}`

      await tx.insert(schema.cashMovement).values({
        id: cashMovementId,
        tenantId,
        cashierSessionId: session.id,
        type: 'DEVOLUCION',
        concept: `Devolución ${returnNumberLabel} · Venta ${
          sale.ticketNumber ? `#${sale.ticketNumber}` : sale.id
        }`.slice(0, 160),
        amount: calculation.total.toString(),
        note: [reason, notes].filter(Boolean).join(' · ') || null,
        createdBy: userId,
      })
    } else if (refundMethod === 'CREDIT_BALANCE') {
      const documentNumber = (sale.customerDocNumber || '').trim()
      if (!documentNumber) {
        throw new Error(
          'Para abonar a cartera la venta debe tener un cliente identificado.'
        )
      }

      const customerRows = await tx
        .select()
        .from(schema.customer)
        .where(
          and(
            eq(schema.customer.tenantId, tenantId),
            eq(schema.customer.documentNumber, documentNumber)
          )
        )
        .limit(1)
        .for('update')

      const customer = customerRows[0]
      if (!customer) throw new Error('No se encontró el cliente de la venta.')

      const balance = roundReturnMoney(Number(customer.creditBalance || 0))
      if (balance <= 0) {
        throw new Error(
          'El cliente no tiene saldo pendiente en cartera. Use efectivo, tarjeta o transferencia.'
        )
      }
      if (calculation.total > balance + 0.005) {
        throw new Error(
          `El abono a cartera no puede superar el saldo del cliente ($${balance.toLocaleString(
            'es-CO'
          )}). Use otro medio para el excedente.`
        )
      }

      const newBalance = roundReturnMoney(balance - calculation.total)
      creditTransactionId = `cct_${randomUUID()}`

      await tx.insert(schema.customerCreditTransaction).values({
        id: creditTransactionId,
        tenantId,
        customerId: customer.id,
        type: 'PAYMENT',
        amount: calculation.total.toString(),
        paidAmount: '0',
        balanceAfter: newBalance.toString(),
        saleId: sale.id,
        note: `Devolución ${returnNumberLabel}`,
        status: 'PAGADO',
      })

      // Aplicar el abono a los cargos pendientes más antiguos (mismo criterio
      // que un abono normal de cartera) para mantener el estado por cargo.
      const pendingCharges = await tx
        .select()
        .from(schema.customerCreditTransaction)
        .where(
          and(
            eq(schema.customerCreditTransaction.tenantId, tenantId),
            eq(schema.customerCreditTransaction.customerId, customer.id),
            eq(schema.customerCreditTransaction.type, 'CHARGE'),
            sql`${schema.customerCreditTransaction.status} IN ('PENDIENTE', 'VENCIDO')`
          )
        )
        .orderBy(asc(schema.customerCreditTransaction.createdAt))
        .for('update')

      let remaining = calculation.total
      for (const charge of pendingCharges) {
        if (remaining <= 0) break
        const chargeAmount = roundReturnMoney(Number(charge.amount || 0))
        const alreadyPaid = roundReturnMoney(Number(charge.paidAmount || 0))
        const outstanding = Math.max(0, roundReturnMoney(chargeAmount - alreadyPaid))
        if (outstanding <= 0) continue

        const applied = Math.min(remaining, outstanding)
        const newPaid = roundReturnMoney(alreadyPaid + applied)
        remaining = roundReturnMoney(remaining - applied)

        await tx
          .update(schema.customerCreditTransaction)
          .set({
            paidAmount: newPaid.toString(),
            status: newPaid >= chargeAmount ? 'PAGADO' : charge.status,
          })
          .where(
            and(
              eq(schema.customerCreditTransaction.id, charge.id),
              eq(schema.customerCreditTransaction.tenantId, tenantId)
            )
          )
      }

      await tx
        .update(schema.customer)
        .set({
          creditBalance: newBalance.toString(),
          creditStatus: newBalance > 0 ? customer.creditStatus || 'AL_DIA' : 'AL_DIA',
          updatedAt: new Date(),
        })
        .where(
          and(eq(schema.customer.id, customer.id), eq(schema.customer.tenantId, tenantId))
        )
    }

    await tx.insert(schema.customerReturn).values({
      id: returnId,
      tenantId,
      saleId: sale.id,
      locationId: sale.locationId,
      userId,
      cashierSessionId,
      returnNumber,
      status: 'COMPLETED',
      reason,
      subtotal: calculation.subtotal.toString(),
      taxAmount: calculation.taxAmount.toString(),
      total: calculation.total.toString(),
      refundMethod,
      refundReference,
      cashMovementId,
      creditTransactionId,
      notes,
    })

    await tx.insert(schema.customerReturnItem).values(
      calculation.lines.map((line: ReturnCalculationLine) => ({
        id: `retitem_${randomUUID()}`,
        returnId,
        saleItemId: line.saleItemId,
        productId: line.productId || '',
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toString(),
        ivaRate: line.ivaRate.toString(),
        ivaAmount: line.ivaAmount.toString(),
        lineTotal: line.lineTotal.toString(),
      }))
    )

    // Entrada de inventario por cada producto devuelto. Si la venta se hizo
    // sin stock y no existe fila de inventario, se crea para no perder el
    // movimiento físico real de la devolución.
    for (const line of calculation.lines) {
      const productId = line.productId
      if (!productId) throw new Error('Una línea de la devolución no tiene producto.')

      const findInventory = () =>
        tx
          .select()
          .from(schema.inventory)
          .where(
            and(
              eq(schema.inventory.tenantId, tenantId),
              eq(schema.inventory.locationId, sale.locationId),
              eq(schema.inventory.productId, productId)
            )
          )
          .limit(1)
          .for('update')

      let inventory = (await findInventory())[0]
      if (!inventory) {
        await tx
          .insert(schema.inventory)
          .values({
            id: `inv_${randomUUID()}`,
            tenantId,
            locationId: sale.locationId,
            productId,
            quantity: '0',
            available: '0',
          })
          .onConflictDoNothing()
        inventory = (await findInventory())[0]
        if (!inventory) throw new Error('No se pudo crear el registro de inventario.')
      }

      const nextQuantity = roundReturnMoney(Number(inventory.quantity || 0) + line.quantity)

      await tx
        .update(schema.inventory)
        .set({
          quantity: sql`${schema.inventory.quantity} + ${line.quantity}`,
          available: sql`${schema.inventory.available} + ${line.quantity}`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(schema.inventory.id, inventory.id), eq(schema.inventory.tenantId, tenantId))
        )

      await tx.insert(schema.inventoryMovement).values({
        id: `mov_${randomUUID()}`,
        tenantId,
        locationId: sale.locationId,
        productId,
        movementType: 'RETURN',
        quantity: line.quantity.toString(),
        reference: 'CUSTOMER_RETURN',
        referenceId: returnId,
        notes: `Devolución ${returnNumberLabel} · Venta ${
          sale.ticketNumber ? `#${sale.ticketNumber}` : sale.id
        } (stock resultante: ${nextQuantity})`,
        idempotencyKey: `return:${returnId}:${line.saleItemId}`,
        userId,
      })
    }

    return {
      returnId,
      saleId: sale.id,
      returnNumber,
      returnNumberLabel,
      total: calculation.total,
      refundMethod,
      cashMovementId,
      creditTransactionId,
      cashierSessionId,
      fullyReturnsSale: calculation.fullyReturnsSale,
    }
  })

  await logAudit(tenantId, userId, AuditAction.CREATE, 'customer_return', result.returnId, {
    saleId: result.saleId,
    returnNumber: result.returnNumber,
    total: result.total,
    refundMethod: result.refundMethod,
    cashMovementId: result.cashMovementId,
    creditTransactionId: result.creditTransactionId,
    fullyReturnsSale: result.fullyReturnsSale,
  })
  await publishEvent(
    tenantId,
    EventType.CUSTOMER_RETURN_COMPLETED,
    'customer_return',
    result.returnId,
    {
      saleId: result.saleId,
      returnNumber: result.returnNumber,
      total: result.total,
      refundMethod: result.refundMethod,
    }
  )

  return {
    returnId: result.returnId,
    saleId: result.saleId,
    returnNumber: result.returnNumber,
    returnNumberLabel: result.returnNumberLabel,
    total: result.total,
    refundMethod: result.refundMethod,
  }
}

export async function getCustomerReturns(
  actor: ActorContext,
  filters: { search?: string; dateFrom?: string; dateTo?: string } = {}
): Promise<CustomerReturnListRow[]> {
  assertActorRole(actor, [...RETURN_READ_ROLES])
  const { tenantId } = actor

  const conditions: any[] = [eq(schema.customerReturn.tenantId, tenantId)]

  const term = filters.search?.trim()
  if (term) {
    const digits = term.replace(/\D/g, '')
    const parts: any[] = [
      ilike(schema.sale.customerName, `%${term}%`),
      ilike(schema.sale.customerDocNumber, `%${term}%`),
      ilike(schema.customerReturn.reason, `%${term}%`),
      eq(schema.customerReturn.id, term),
    ]
    if (digits) {
      parts.push(eq(schema.sale.ticketNumber, Number(digits)))
      parts.push(eq(schema.customerReturn.returnNumber, Number(digits)))
    }
    conditions.push(or(...parts))
  }

  if (filters.dateFrom) {
    const from = new Date(filters.dateFrom)
    from.setHours(0, 0, 0, 0)
    conditions.push(gte(schema.customerReturn.createdAt, from))
  }
  if (filters.dateTo) {
    const to = new Date(filters.dateTo)
    to.setHours(23, 59, 59, 999)
    conditions.push(lte(schema.customerReturn.createdAt, to))
  }

  const rows = await db
    .select({
      id: schema.customerReturn.id,
      returnNumber: schema.customerReturn.returnNumber,
      saleId: schema.customerReturn.saleId,
      customerName: schema.sale.customerName,
      customerDocNumber: schema.sale.customerDocNumber,
      reason: schema.customerReturn.reason,
      subtotal: schema.customerReturn.subtotal,
      taxAmount: schema.customerReturn.taxAmount,
      total: schema.customerReturn.total,
      refundMethod: schema.customerReturn.refundMethod,
      refundReference: schema.customerReturn.refundReference,
      status: schema.customerReturn.status,
      createdAt: schema.customerReturn.createdAt,
      saleTicketNumber: schema.sale.ticketNumber,
      userName: schema.user.name,
    })
    .from(schema.customerReturn)
    .leftJoin(schema.sale, eq(schema.customerReturn.saleId, schema.sale.id))
    .leftJoin(schema.user, eq(schema.customerReturn.userId, schema.user.id))
    .where(and(...conditions))
    .orderBy(desc(schema.customerReturn.createdAt))
    .limit(200)

  const ids = rows.map((row) => row.id)
  const itemCounts = new Map<string, number>()
  const unitCounts = new Map<string, number>()
  if (ids.length) {
    const counts = await db
      .select({
        returnId: schema.customerReturnItem.returnId,
        count: sql<number>`count(*)`,
        units: sql<string>`coalesce(sum(${schema.customerReturnItem.quantity}), 0)`,
      })
      .from(schema.customerReturnItem)
      .where(inArray(schema.customerReturnItem.returnId, ids))
      .groupBy(schema.customerReturnItem.returnId)
    counts.forEach((row) => {
      itemCounts.set(row.returnId, Number(row.count || 0))
      unitCounts.set(row.returnId, Number(row.units || 0))
    })
  }

  return rows.map((row) => ({
    id: row.id,
    returnNumber: row.returnNumber,
    returnNumberLabel: formatReturnNumber(row.returnNumber),
    saleId: row.saleId,
    saleTicketNumber: row.saleTicketNumber,
    customerName: row.customerName,
    customerDocNumber: row.customerDocNumber,
    reason: row.reason,
    subtotal: Number(row.subtotal || 0),
    taxAmount: Number(row.taxAmount || 0),
    total: Number(row.total || 0),
    refundMethod: row.refundMethod as RefundMethod,
    refundReference: row.refundReference,
    status: row.status,
    itemCount: itemCounts.get(row.id) ?? 0,
    unitCount: roundReturnMoney(unitCounts.get(row.id) ?? 0),
    userName: row.userName,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : '',
  }))
}

export async function getCustomerReturnDetail(
  actor: ActorContext,
  returnId: string
): Promise<CustomerReturnDetail> {
  assertActorRole(actor, [...RETURN_READ_ROLES])
  const { tenantId } = actor

  const rows = await db
    .select({
      returnRow: schema.customerReturn,
      saleTicketNumber: schema.sale.ticketNumber,
      customerName: schema.sale.customerName,
      customerDocNumber: schema.sale.customerDocNumber,
      userName: schema.user.name,
      userEmail: schema.user.email,
      locationName: schema.location.name,
    })
    .from(schema.customerReturn)
    .leftJoin(schema.sale, eq(schema.customerReturn.saleId, schema.sale.id))
    .leftJoin(schema.user, eq(schema.customerReturn.userId, schema.user.id))
    .leftJoin(schema.location, eq(schema.customerReturn.locationId, schema.location.id))
    .where(
      and(
        eq(schema.customerReturn.id, returnId),
        eq(schema.customerReturn.tenantId, tenantId)
      )
    )
    .limit(1)

  const row = rows[0]
  if (!row) throw new Error('Devolución no encontrada.')
  const returnRow = row.returnRow

  const [company] = await db
    .select({
      legalName: schema.tenant.legalName,
      nit: schema.tenant.nit,
      tradeName: schema.tenant.tradeName,
      address: schema.tenant.address,
      city: schema.tenant.city,
    })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, tenantId))
    .limit(1)

  const fiscalRows = await db
    .select({ fullNumber: schema.fiscalDocument.fullNumber })
    .from(schema.fiscalDocument)
    .where(
      and(
        eq(schema.fiscalDocument.saleId, returnRow.saleId),
        eq(schema.fiscalDocument.tenantId, tenantId),
        sql`${schema.fiscalDocument.fullNumber} IS NOT NULL`,
        sql`${schema.fiscalDocument.documentType} IN ('FACTURA_ELECTRONICA_VENTA', 'DOCUMENTO_EQUIVALENTE_POS')`
      )
    )
    .limit(1)

  const itemRows = await db
    .select({
      id: schema.customerReturnItem.id,
      saleItemId: schema.customerReturnItem.saleItemId,
      productId: schema.customerReturnItem.productId,
      quantity: schema.customerReturnItem.quantity,
      unitPrice: schema.customerReturnItem.unitPrice,
      ivaRate: schema.customerReturnItem.ivaRate,
      ivaAmount: schema.customerReturnItem.ivaAmount,
      lineTotal: schema.customerReturnItem.lineTotal,
      productName: schema.product.name,
      sku: schema.product.sku,
    })
    .from(schema.customerReturnItem)
    .leftJoin(schema.product, eq(schema.customerReturnItem.productId, schema.product.id))
    .where(eq(schema.customerReturnItem.returnId, returnId))

  return {
    id: returnRow.id,
    returnNumber: returnRow.returnNumber,
    returnNumberLabel: formatReturnNumber(returnRow.returnNumber),
    saleId: returnRow.saleId,
    saleTicketNumber: row.saleTicketNumber,
    invoiceNumber: fiscalRows[0]?.fullNumber ?? null,
    customerName: row.customerName,
    customerDocNumber: row.customerDocNumber,
    reason: returnRow.reason,
    subtotal: Number(returnRow.subtotal || 0),
    taxAmount: Number(returnRow.taxAmount || 0),
    total: Number(returnRow.total || 0),
    refundMethod: returnRow.refundMethod as RefundMethod,
    refundReference: returnRow.refundReference,
    status: returnRow.status,
    itemCount: itemRows.length,
    unitCount: roundReturnMoney(
      itemRows.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
    ),
    userName: row.userName,
    userEmail: row.userEmail,
    company: company
      ? {
          legalName: company.legalName,
          nit: company.nit,
          tradeName: company.tradeName,
          address: company.address,
          city: company.city,
        }
      : null,
    notes: returnRow.notes,
    locationId: returnRow.locationId,
    locationName: row.locationName,
    cashierSessionId: returnRow.cashierSessionId,
    cashMovementId: returnRow.cashMovementId,
    creditTransactionId: returnRow.creditTransactionId,
    createdAt: returnRow.createdAt ? new Date(returnRow.createdAt).toISOString() : '',
    items: itemRows.map((item) => ({
      id: item.id,
      saleItemId: item.saleItemId,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      ivaRate: Number(item.ivaRate || 0),
      ivaAmount: Number(item.ivaAmount || 0),
      lineTotal: Number(item.lineTotal || 0),
    })),
  }
}
