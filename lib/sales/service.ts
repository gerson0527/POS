// Servicio de dominio de ventas. Recibe el actor explícito (userId, tenantId,
// rol): no lee cookies ni headers, así que lo pueden invocar las Server Actions
// y los canales externos (bot) con exactamente las mismas validaciones.
import { and, desc, eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import {
  AuditAction,
  CompleteSaleDTO,
  CreateSaleDTO,
  EventType,
  PaymentStatus,
  SaleStatus,
} from '@/lib/types'
import { calculateSaleTotals, roundToNearest100 } from '@/lib/utils/pos-utils'
import { getBogotaBusinessDate, toBusinessDateString } from '@/lib/utils/business-date'
import { assertActorRole, type ActorContext } from '@/lib/auth/actor'
import { logAudit, publishEvent } from '@/lib/audit/log'
import { enqueueFiscalEmission, retryFiscalEmission } from '@/lib/fiscal/outbox'
import { getInvoiceProvider } from '@/lib/invoicing'

export const SALE_ROLES = ['ADMIN', 'MANAGER', 'CASHIER'] as const

export interface CreateSaleResult {
  saleId: string
  ticketNumber: number
}

export interface CompleteSaleResult {
  saleId: string
  ticketNumber: number | null
  total: number
  transmissionMode: 'AUTO' | 'MANUAL'
  fiscal: { success: boolean; message: string; cufe?: string } | null
}

export async function createSale(
  actor: ActorContext,
  input: CreateSaleDTO
): Promise<CreateSaleResult> {
  assertActorRole(actor, [...SALE_ROLES])
  const { userId, tenantId } = actor

  if (!input.items?.length) throw new Error('La venta debe tener al menos un producto.')

  // La venta sólo puede originarse en un turno de caja abierto y de la fecha
  // de negocio actual. Nunca se abre una caja automáticamente al facturar.
  const cashierSession = await db
    .select()
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

  const session = cashierSession[0]
  if (!session) {
    throw new Error(
      'No hay una caja abierta para la fecha de hoy. Abra un turno de caja antes de facturar.'
    )
  }

  const saleId = `sale_${randomUUID()}`

  // Si el canal manda solo documento/nombre, completar email/dirección/teléfono
  // desde el cliente registrado para que la factura no falle por snapshot vacío.
  let customerSnapshot = {
    documentType: input.customer?.documentType || null,
    documentNumber: input.customer?.documentNumber || null,
    name: input.customer?.name || null,
    email: input.customer?.email || null,
    phone: input.customer?.phone || null,
    address: input.customer?.address || null,
  }
  if (customerSnapshot.documentNumber) {
    const registered = await db
      .select()
      .from(schema.customer)
      .where(
        and(
          eq(schema.customer.tenantId, tenantId),
          eq(schema.customer.documentNumber, customerSnapshot.documentNumber)
        )
      )
      .limit(1)
    const row = registered[0]
    if (row) {
      customerSnapshot = {
        documentType: customerSnapshot.documentType || row.documentType || null,
        documentNumber: customerSnapshot.documentNumber,
        name: customerSnapshot.name || row.name || null,
        email: customerSnapshot.email || row.email || null,
        phone: customerSnapshot.phone || row.phone || null,
        address: customerSnapshot.address || row.address || null,
      }
    }
  }

  const result = await db.transaction(async (tx) => {
    // Serializa la asignación de ticket por tenant dentro de la transacción.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`)

    const maxTicketResult = await tx
      .select({ maxTicket: sql<number>`coalesce(max(${schema.sale.ticketNumber}), 0)` })
      .from(schema.sale)
      .where(eq(schema.sale.tenantId, tenantId))
    const ticketNumber = Number(maxTicketResult[0]?.maxTicket || 0) + 1

    let isWithoutStockSale = false

    await tx.insert(schema.sale).values({
      id: saleId,
      tenantId,
      locationId: session.locationId,
      cashierSessionId: session.id,
      userId,
      ticketNumber,
      subtotal: '0',
      taxAmount: '0',
      total: '0',
      discountAmount: '0',
      discountPercentage: '0',
      status: SaleStatus.DRAFT,
      customerDocType: customerSnapshot.documentType,
      customerDocNumber: customerSnapshot.documentNumber,
      customerName: customerSnapshot.name,
      customerEmail: customerSnapshot.email,
      customerPhone: customerSnapshot.phone,
      customerAddress: customerSnapshot.address,
      notes:
        input.notes ||
        (input.allowWithoutStock ? '[VENTA REALIZADA SIN STOCK EN INVENTARIO]' : null),
    })

    for (const item of input.items) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        throw new Error(`Cantidad inválida para el producto ${item.productId}.`)
      }

      const productRows = await tx
        .select()
        .from(schema.product)
        .where(
          and(
            eq(schema.product.id, item.productId),
            eq(schema.product.tenantId, tenantId)
          )
        )
        .limit(1)

      const product = productRows[0]
      if (!product) throw new Error(`Producto no encontrado: ${item.productId}`)

      const inventoryRows = await tx
        .select()
        .from(schema.inventory)
        .where(
          and(
            eq(schema.inventory.tenantId, tenantId),
            eq(schema.inventory.locationId, session.locationId),
            eq(schema.inventory.productId, item.productId)
          )
        )
        .limit(1)

      const availableStock = inventoryRows.length
        ? Number(inventoryRows[0].quantity || 0)
        : 0

      if (availableStock <= 0 || item.quantity > availableStock) {
        if (!input.allowWithoutStock) {
          if (availableStock <= 0) {
            throw new Error(
              `¡SIN STOCK! El producto "${product.name}" no tiene existencias en la sede de la venta.`
            )
          }
          throw new Error(
            `¡STOCK INSUFICIENTE! Para "${product.name}" solicitó ${item.quantity} unidad(es), pero hay ${availableStock}.`
          )
        }
        isWithoutStockSale = true
      }

      const unitPrice = Number(product.unitPrice)
      const ivaRate = Number(product.ivaRate)
      const lineSubtotal = item.quantity * unitPrice
      const ivaAmount = lineSubtotal * (ivaRate / 100)

      await tx.insert(schema.saleItem).values({
        id: `item_${randomUUID()}`,
        saleId,
        productId: item.productId,
        quantity: item.quantity.toString(),
        unitPrice: product.unitPrice,
        ivaRate: product.ivaRate,
        taxTreatment: product.taxTreatment || 'TAXED',
        ivaAmount: ivaAmount.toString(),
        lineTotal: (lineSubtotal + ivaAmount).toString(),
      })
    }

    const saleItems = await tx
      .select()
      .from(schema.saleItem)
      .where(eq(schema.saleItem.saleId, saleId))

    const totals = calculateSaleTotals(
      saleItems.map((saleItem) => ({
        quantity: Number(saleItem.quantity),
        unitPrice: Number(saleItem.unitPrice),
        ivaRate: Number(saleItem.ivaRate),
      }))
    )

    await tx
      .update(schema.sale)
      .set({
        subtotal: totals.subtotal.toString(),
        taxAmount: totals.taxAmount.toString(),
        total: totals.total.toString(),
        discountAmount: totals.discountAmount.toString(),
        notes: isWithoutStockSale
          ? '[VENTA REALIZADA SIN STOCK EN INVENTARIO]'
          : input.notes || null,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.sale.id, saleId), eq(schema.sale.tenantId, tenantId)))

    return { saleId, ticketNumber }
  })

  await publishEvent(tenantId, EventType.SALE_CREATED, 'sale', saleId, input)

  return result
}

export async function completeSale(
  actor: ActorContext,
  input: CompleteSaleDTO
): Promise<CompleteSaleResult> {
  assertActorRole(actor, [...SALE_ROLES])
  const { userId, tenantId, role } = actor

  if (!input.payments?.length) throw new Error('La venta debe tener al menos un pago.')
  for (const payment of input.payments) {
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
      throw new Error('Todos los pagos deben tener un monto mayor que cero.')
    }
  }

  const discountPercentage = Math.min(
    100,
    Math.max(0, Number(input.discountPercentage) || 0)
  )

  const completed = await db.transaction(async (tx) => {
    // Modo de transmisión configurado por la empresa. Se lee en el servidor
    // (no se confía en el cliente): MANUAL deja el evento retenido para revisión.
    const tenantRows = await tx
      .select({ dianTransmissionMode: schema.tenant.dianTransmissionMode })
      .from(schema.tenant)
      .where(eq(schema.tenant.id, tenantId))
      .limit(1)
    const transmissionMode: 'AUTO' | 'MANUAL' =
      tenantRows[0]?.dianTransmissionMode === 'MANUAL' ? 'MANUAL' : 'AUTO'

    // Bloquea la venta para que dos clics concurrentes no la completen dos veces.
    const saleRows = await tx
      .select()
      .from(schema.sale)
      .where(and(eq(schema.sale.id, input.saleId), eq(schema.sale.tenantId, tenantId)))
      .limit(1)
      .for('update')

    const sale = saleRows[0]
    if (!sale) throw new Error('Venta no encontrada.')
    if (sale.status !== SaleStatus.DRAFT) {
      throw new Error('La venta ya fue procesada o no está en borrador.')
    }

    if (role === 'CASHIER' && sale.userId !== userId) {
      throw new Error('No puede completar una venta de otro cajero.')
    }

    const sessionRows = await tx
      .select()
      .from(schema.cashierSession)
      .where(
        and(
          eq(schema.cashierSession.id, sale.cashierSessionId),
          eq(schema.cashierSession.tenantId, tenantId)
        )
      )
      .limit(1)
      .for('update')

    const saleSession = sessionRows[0]
    if (!saleSession) {
      throw new Error('La venta no tiene un turno de caja asociado.')
    }
    if (saleSession.status !== 'OPEN') {
      throw new Error(
        'El turno de caja de esta venta ya fue cerrado. No se puede completar la venta.'
      )
    }
    if (toBusinessDateString(saleSession.businessDate) !== getBogotaBusinessDate()) {
      throw new Error(
        'La venta pertenece a un turno de caja de otra fecha. Debe registrarla en el turno del día.'
      )
    }

    const saleItems = await tx
      .select()
      .from(schema.saleItem)
      .where(eq(schema.saleItem.saleId, input.saleId))

    if (!saleItems.length) throw new Error('La venta no tiene productos.')

    const totals = calculateSaleTotals(
      saleItems.map((item) => ({
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        ivaRate: Number(item.ivaRate),
      })),
      discountPercentage
    )

    const totalPayment = roundToNearest100(
      input.payments.reduce((sum, payment) => sum + payment.amount, 0)
    )
    const saleTotal = roundToNearest100(totals.total)
    if (totalPayment !== saleTotal) {
      throw new Error(
        `El pago ingresado ($${totalPayment}) no coincide con el total de la venta ($${saleTotal}).`
      )
    }

    const updatedSale = await tx
      .update(schema.sale)
      .set({
        status: SaleStatus.COMPLETED,
        completedAt: new Date(),
        subtotal: totals.subtotal.toString(),
        taxAmount: totals.taxAmount.toString(),
        total: totals.total.toString(),
        discountPercentage: discountPercentage.toString(),
        discountAmount: totals.discountAmount.toString(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.sale.id, input.saleId),
          eq(schema.sale.tenantId, tenantId),
          eq(schema.sale.status, SaleStatus.DRAFT)
        )
      )
      .returning({ id: schema.sale.id, ticketNumber: schema.sale.ticketNumber })

    if (!updatedSale.length) {
      throw new Error('La venta ya fue procesada por otra operación.')
    }

    for (const payment of input.payments) {
      await tx.insert(schema.payment).values({
        id: `pay_${randomUUID()}`,
        saleId: input.saleId,
        method: payment.method,
        amount: payment.amount.toString(),
        reference: payment.reference,
        status: PaymentStatus.PROCESSED,
        processedAt: new Date(),
      })
    }

    const creditTotal = input.payments
      .filter((payment) => String(payment.method).toUpperCase() === 'STORE_CREDIT')
      .reduce((sum, payment) => sum + payment.amount, 0)

    if (creditTotal > 0) {
      const docNumber = (sale.customerDocNumber || '').trim()
      if (!docNumber) throw new Error('Para vender a crédito debe seleccionar un cliente.')

      const customerRows = await tx
        .select()
        .from(schema.customer)
        .where(
          and(
            eq(schema.customer.tenantId, tenantId),
            eq(schema.customer.documentNumber, docNumber)
          )
        )
        .limit(1)
        .for('update')

      const customer = customerRows[0]
      if (!customer) throw new Error('No se encontró el cliente para el cargo a crédito.')
      if (customer.creditEnabled !== 'SI') throw new Error('El cliente no tiene crédito habilitado.')
      if (customer.creditStatus === 'BLOQUEADO') throw new Error('El crédito del cliente está bloqueado.')

      const currentBalance = Number(customer.creditBalance)
      const creditLimit = Number(customer.creditLimit)
      if (creditLimit > 0 && currentBalance + creditTotal > creditLimit) {
        throw new Error(
          `Cupo insuficiente. Disponible: $${Math.max(0, creditLimit - currentBalance).toLocaleString('es-CO')}`
        )
      }

      const newBalance = currentBalance + creditTotal
      await tx.insert(schema.customerCreditTransaction).values({
        id: `cct_${randomUUID()}`,
        tenantId,
        customerId: customer.id,
        type: 'CHARGE',
        amount: creditTotal.toString(),
        paidAmount: '0',
        balanceAfter: newBalance.toString(),
        saleId: input.saleId,
        note: `Venta POS${sale.ticketNumber ? ` #${sale.ticketNumber}` : ''}`,
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        status: 'PENDIENTE',
      })

      await tx
        .update(schema.customer)
        .set({
          creditBalance: newBalance.toString(),
          creditStatus: newBalance > 0 ? customer.creditStatus || 'AL_DIA' : 'AL_DIA',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.customer.id, customer.id),
            eq(schema.customer.tenantId, tenantId)
          )
        )
    }

    const allowWithoutStock = (sale.notes || '').includes('SIN STOCK')
    for (const item of saleItems) {
      const quantity = Number(item.quantity)
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`Cantidad inválida en la venta para el producto ${item.productId}.`)
      }

      const inventoryRows = await tx
        .select()
        .from(schema.inventory)
        .where(
          and(
            eq(schema.inventory.tenantId, tenantId),
            eq(schema.inventory.locationId, sale.locationId),
            eq(schema.inventory.productId, item.productId)
          )
        )
        .limit(1)
        .for('update')

      const inventory = inventoryRows[0]
      if (!inventory) {
        if (allowWithoutStock) continue
        throw new Error(
          `No hay inventario del producto ${item.productId} en la sede de la venta.`
        )
      }

      const available = Number(inventory.quantity)
      if (available < quantity && !allowWithoutStock) {
        throw new Error(
          `Stock insuficiente para el producto ${item.productId}. Disponible: ${available}.`
        )
      }

      const nextQuantity = available - quantity
      await tx
        .update(schema.inventory)
        .set({
          quantity: sql`${schema.inventory.quantity} - ${quantity}`,
          available: sql`${schema.inventory.available} - ${quantity}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.inventory.id, inventory.id),
            eq(schema.inventory.tenantId, tenantId)
          )
        )

      await tx.insert(schema.inventoryMovement).values({
        id: `mov_${randomUUID()}`,
        tenantId,
        locationId: sale.locationId,
        productId: item.productId,
        movementType: 'SALE',
        quantity: (-quantity).toString(),
        reference: 'SALE',
        referenceId: input.saleId,
        notes: `Venta POS${sale.ticketNumber ? ` #${sale.ticketNumber}` : ''} (stock resultante: ${nextQuantity})`,
        userId,
      })
    }

    // Solo encola FE si hay proveedor (Factus) configurado. Sin config la venta
    // es comprobante POS y no debe aparecer como ERROR DIAN / REINTENTAR.
    const hasElectronicProvider = Boolean(await getInvoiceProvider(tenantId))
    if (hasElectronicProvider) {
      await enqueueFiscalEmission(tx, tenantId, input.saleId, {
        requiresManualApproval: transmissionMode === 'MANUAL',
      })
    }

    return {
      ticketNumber: updatedSale[0].ticketNumber,
      total: totals.total,
      transmissionMode,
      hasElectronicProvider,
    }
  })

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'sale', input.saleId, {
    status: SaleStatus.COMPLETED,
    total: completed.total,
  })
  await publishEvent(tenantId, EventType.SALE_COMPLETED, 'sale', input.saleId, input)

  // La venta ya está confirmada. La emisión fiscal es durable (outbox): si
  // Factus/DIAN falla, queda pendiente para reintento sin duplicar la factura.
  // En modo MANUAL NO se transmite: el evento queda retenido para la contadora.
  let fiscal: CompleteSaleResult['fiscal'] = null
  if (completed.hasElectronicProvider && completed.transmissionMode === 'AUTO') {
    try {
      fiscal = await retryFiscalEmission(tenantId, input.saleId, {
        requestedBy: userId,
      })
    } catch (outboxErr: any) {
      console.error('[fiscal outbox] No se pudo procesar la emisión:', outboxErr)
      fiscal = { success: false, message: 'La factura electrónica quedó pendiente de reintento.' }
    }
  }

  return {
    saleId: input.saleId,
    ticketNumber: completed.ticketNumber,
    total: completed.total,
    transmissionMode: completed.transmissionMode,
    fiscal,
  }
}
