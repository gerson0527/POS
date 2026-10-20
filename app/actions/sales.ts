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
  PaymentStatus,
  AuditAction,
  EventType
} from '@/lib/types'
import { calculateSaleTotals, formatInvoiceNumber, roundToNearest100 } from '@/lib/utils/pos-utils'
import { INTERNAL_NUMERATION } from '@/lib/fiscal/numeration'
import { and, eq, lt, sql, desc } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import {
  getUserId,
  getTenantId,
  logAudit,
  publishEvent,
  requireRole,
  getBogotaBusinessDate,
  toBusinessDateString,
} from './_shared'
import { enqueueFiscalEmission, retryFiscalEmission } from '@/lib/fiscal/outbox'
export async function createSale(input: CreateSaleDTO) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER', 'CASHIER'])
  const tenantId = await getTenantId(userId)

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

  if (!cashierSession.length) {
    throw new Error(
      'No hay una caja abierta para la fecha de hoy. Abra un turno de caja antes de facturar.'
    )
  }

  const session = cashierSession[0]
  if (!session) {
    throw new Error('No hay una caja abierta para la fecha de hoy.')
  }

  const saleId = `sale_${randomUUID()}`

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
      customerDocType: input.customer?.documentType || null,
      customerDocNumber: input.customer?.documentNumber || null,
      customerName: input.customer?.name || null,
      customerEmail: input.customer?.email || null,
      customerPhone: input.customer?.phone || null,
      customerAddress: input.customer?.address || null,
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

  revalidatePath('/pos')
  return { ...result, success: true }
}

export async function getSale(saleId: string) {
  const userId = await getUserId()
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
  const userId = await getUserId()
  const membership = await requireRole(userId, ['ADMIN', 'MANAGER', 'CASHIER'])
  const tenantId = await getTenantId(userId)

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

    if (membership.role === 'CASHIER' && sale.userId !== userId) {
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

    await enqueueFiscalEmission(tx, tenantId, input.saleId)

    return {
      ticketNumber: updatedSale[0].ticketNumber,
      total: totals.total,
    }
  })

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'sale', input.saleId, {
    status: SaleStatus.COMPLETED,
    total: completed.total,
  })
  await publishEvent(tenantId, EventType.SALE_COMPLETED, 'sale', input.saleId, input)

  // La venta ya está confirmada. La emisión fiscal es durable (outbox): si
  // Factus/DIAN falla, queda pendiente para reintento sin duplicar la factura.
  let fiscal: { success: boolean; message: string; cufe?: string } | null = null
  try {
    fiscal = await retryFiscalEmission(tenantId, input.saleId)
  } catch (outboxErr: any) {
    console.error('[fiscal outbox] No se pudo procesar la emisión:', outboxErr)
    fiscal = { success: false, message: 'La factura electrónica quedó pendiente de reintento.' }
  }

  revalidatePath('/pos')
  return {
    success: true,
    saleId: input.saleId,
    ticketNumber: completed.ticketNumber,
    total: completed.total,
    fiscal,
  }
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
    if (existing[0].status !== 'ACTIVE') {
      throw new Error('La numeración interna del POS está inactiva. Actívela en Configuración.')
    }
    if (existing[0].documentType !== INTERNAL_NUMERATION.documentType) {
      throw new Error('La numeración interna del POS tiene un tipo de documento inválido. Corríjala en Configuración.')
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
    .limit(1)
  const existingDoc = existingDocs[0]

  // La numeración electrónica la asigna Factus: si ya hay CUFE, no se consume
  // ningún consecutivo interno ni se reescribe el documento oficial.
  if (existingDoc?.uniqueCode) {
    return {
      invoiceId: existingDoc.id,
      cufe: existingDoc.uniqueCode,
      invoiceNumber: existingDoc.fullNumber,
      success: true,
    }
  }

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

