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
import { calculateSaleTotals, formatInvoiceNumber, getNextInvoiceNumber, roundToNearest100 } from '@/lib/utils/pos-utils'
import { generateCUFE } from '@/lib/fiscal/cufe'
import { and, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUserId, getTenantId, logAudit, publishEvent } from './_shared'
import { emitFactusElectronicInvoice } from './factus-service'
import { chargeCustomerCredit } from './customers'
export async function createSale(input: CreateSaleDTO) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  // Get active cashier session for tenant
  let cashierSession = await db
    .select()
    .from(schema.cashierSession)
    .where(
      and(
        eq(schema.cashierSession.tenantId, tenantId),
        eq(schema.cashierSession.status, 'OPEN')
      )
    )
    .limit(1)

  if (!cashierSession.length) {
    const locations = await db.select().from(schema.location).where(eq(schema.location.tenantId, tenantId)).limit(1)
    let locationId = locations[0]?.id || input.locationId || 'loc_default'

    if (!locations.length) {
      await db.insert(schema.location).values({
        id: locationId,
        tenantId,
        name: 'Sucursal Principal POS',
        code: 'PRINCIPAL',
        status: 'ACTIVE',
      })
    }

    const sessionId = `cs_${Date.now()}`
    await db.insert(schema.cashierSession).values({
      id: sessionId,
      tenantId,
      locationId,
      userId,
      status: 'OPEN',
      openingBalance: '0',
    })

    cashierSession = await db.select().from(schema.cashierSession).where(eq(schema.cashierSession.id, sessionId)).limit(1)
  }

  const saleId = `sale_${Date.now()}`

  // Get global consecutive ticket number for tenant (never repeats across cashier sessions)
  const maxTicketResult = await db
    .select({ maxTicket: sql<number>`coalesce(max(${schema.sale.ticketNumber}), 0)` })
    .from(schema.sale)
    .where(eq(schema.sale.tenantId, tenantId))

  const ticketNumber = Number(maxTicketResult[0]?.maxTicket || 0) + 1

  // Create sale
  await db.insert(schema.sale).values({
    id: saleId,
    tenantId,
    locationId: cashierSession[0].locationId || input.locationId || 'loc_bogota_01',
    cashierSessionId: cashierSession[0].id,
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
    notes: input.notes || (input.allowWithoutStock ? '[VENTA REALIZADA SIN STOCK EN INVENTARIO]' : null),
  })

  // Add items
  let totals = { subtotal: 0, taxAmount: 0, total: 0, discountAmount: 0 }
  let isWithoutStockSale = false

  for (const item of input.items) {
    const product = await db
      .select()
      .from(schema.product)
      .where(and(eq(schema.product.id, item.productId), eq(schema.product.tenantId, tenantId)))
      .limit(1)

    if (!product.length) throw new Error(`Producto no encontrado: ${item.productId}`)

    const prod = product[0]

    // Validar Stock Disponible en Inventario
    const inv = await db
      .select()
      .from(schema.inventory)
      .where(eq(schema.inventory.productId, item.productId))
      .limit(1)

    const availableStock = inv.length ? Number(inv[0].quantity || 0) : 0

    if (availableStock <= 0 || item.quantity > availableStock) {
      if (!input.allowWithoutStock) {
        if (availableStock <= 0) {
          throw new Error(`¡SIN STOCK! El producto "${prod.name}" no tiene existencias disponibles en inventario (Stock actual: 0).`)
        } else {
          throw new Error(`¡STOCK INSUFICIENTE! Para el producto "${prod.name}" solicitó ${item.quantity} unidad(es), pero solo hay ${availableStock} disponible(s).`)
        }
      }
      isWithoutStockSale = true
    }
    const unitPrice = Number(prod.unitPrice)
    const ivaRate = Number(prod.ivaRate)
    const lineTotal = item.quantity * unitPrice
    const ivaAmount = lineTotal * (ivaRate / 100)

    await db.insert(schema.saleItem).values({
      id: `item_${Date.now()}_${Math.random()}`,
      saleId,
      productId: item.productId,
      quantity: item.quantity.toString(),
      unitPrice: prod.unitPrice,
      ivaRate: prod.ivaRate,
      ivaAmount: ivaAmount.toString(),
      lineTotal: (lineTotal + ivaAmount).toString()
    })
  }

  // Recalculate and update totals
  const saleItems = await db.select().from(schema.saleItem).where(eq(schema.saleItem.saleId, saleId))

  totals = calculateSaleTotals(
    saleItems.map((si) => ({
      quantity: Number(si.quantity),
      unitPrice: Number(si.unitPrice),
      ivaRate: Number(si.ivaRate)
    }))
  )

  await db
    .update(schema.sale)
    .set({
      subtotal: totals.subtotal.toString(),
      taxAmount: totals.taxAmount.toString(),
      total: totals.total.toString(),
      discountAmount: totals.discountAmount.toString(),
      notes: isWithoutStockSale ? '[VENTA REALIZADA SIN STOCK EN INVENTARIO]' : (input.notes || null),
    })
    .where(eq(schema.sale.id, saleId))

  await publishEvent(tenantId, EventType.SALE_CREATED, 'sale', saleId, input)

  revalidatePath('/pos')
  return { saleId, ticketNumber, success: true }
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
  const tenantId = await getTenantId(userId)

  const sale = await db
    .select()
    .from(schema.sale)
    .where(and(eq(schema.sale.id, input.saleId), eq(schema.sale.tenantId, tenantId)))
    .limit(1)

  if (!sale.length) throw new Error('Sale not found')
  if (sale[0].status !== SaleStatus.DRAFT) throw new Error('Sale is not in draft status')

  // Calculate total payment with 100 COP rounding
  const totalPayment = roundToNearest100(input.payments.reduce((sum, p) => sum + p.amount, 0))
  const saleTotal = roundToNearest100(Number(sale[0].total))

  if (Math.abs(totalPayment - saleTotal) > 100) {
    throw new Error(`El pago ingresado ($${totalPayment}) no coincide con el total de la venta ($${saleTotal})`)
  }

  // Pago a crédito (cuenta corriente): valida cupo y registra el cargo ANTES de
  // completar la venta, para no dejarla cerrada si el crédito falla.
  const creditTotal = input.payments
    .filter((p) => String(p.method).toUpperCase() === 'STORE_CREDIT')
    .reduce((sum, p) => sum + p.amount, 0)
  if (creditTotal > 0) {
    const docNumber = (sale[0].customerDocNumber || '').trim()
    if (!docNumber) throw new Error('Para vender a crédito debe seleccionar un cliente.')
    const cust = await db
      .select({ id: schema.customer.id })
      .from(schema.customer)
      .where(
        and(eq(schema.customer.tenantId, tenantId), eq(schema.customer.documentNumber, docNumber))
      )
      .limit(1)
    if (!cust.length) throw new Error('No se encontró el cliente para el cargo a crédito.')
    await chargeCustomerCredit({
      customerId: cust[0].id,
      amount: creditTotal,
      saleId: input.saleId,
      note: `Venta POS${sale[0].ticketNumber ? ` #${sale[0].ticketNumber}` : ''}`,
    })
  }

  // Record payments
  for (const payment of input.payments) {
    await db.insert(schema.payment).values({
      id: `pay_${Date.now()}_${Math.random()}`,
      saleId: input.saleId,
      method: payment.method,
      amount: payment.amount.toString(),
      reference: payment.reference,
      status: PaymentStatus.PROCESSED,
      processedAt: new Date()
    })
  }

  // Update sale
  const discountAmount = input.discountPercentage ? (Number(sale[0].subtotal) * input.discountPercentage) / 100 : 0

  await db
    .update(schema.sale)
    .set({
      status: SaleStatus.COMPLETED,
      completedAt: new Date(),
      discountPercentage: (input.discountPercentage ?? 0).toString(),
      discountAmount: discountAmount.toString()
    })
    .where(eq(schema.sale.id, input.saleId))

  // Update inventory
  const saleItems = await db.select().from(schema.saleItem).where(eq(schema.saleItem.saleId, input.saleId))

  for (const item of saleItems) {
    await db
      .update(schema.inventory)
      .set({
        quantity: sql`quantity - ${item.quantity}`,
        available: sql`available - ${item.quantity}`
      })
      .where(
        and(
          eq(schema.inventory.productId, item.productId),
          eq(schema.inventory.tenantId, tenantId)
        )
      )
  }

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'sale', input.saleId, { status: SaleStatus.COMPLETED })
  await publishEvent(tenantId, EventType.SALE_COMPLETED, 'sale', input.saleId, input)

  // Transmisión automática de Factura Electrónica Factus V2 / DIAN
  try {
    await emitFactusElectronicInvoice(input.saleId)
  } catch (dianErr) {
    console.error('[DIAN Factus V2 Auto-Transmit Error]:', dianErr)
  }

  revalidatePath('/pos')
  return { success: true, saleId: input.saleId }
}

// INVOICE GENERATION
export async function generateInvoice(input: GenerateInvoiceDTO) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const sale = await db
    .select()
    .from(schema.sale)
    .where(and(eq(schema.sale.id, input.saleId), eq(schema.sale.tenantId, tenantId)))
    .limit(1)

  if (!sale.length) throw new Error('Sale not found')
  if (sale[0].status !== SaleStatus.COMPLETED) throw new Error('Sale must be completed')

  // Get or create numeration - Fallback so missing DIAN resolution NEVER blocks sales
  let numeration = await db
    .select()
    .from(schema.numeration)
    .where(
      and(
        eq(schema.numeration.tenantId, tenantId),
        eq(schema.numeration.resolution, input.resolution),
        eq(schema.numeration.prefix, input.prefix)
      )
    )
    .limit(1)

  if (!numeration.length) {
    // Try to find ANY existing numeration for this tenant
    numeration = await db
      .select()
      .from(schema.numeration)
      .where(eq(schema.numeration.tenantId, tenantId))
      .limit(1)
  }

  if (!numeration.length) {
    const numerationId = `num_${Date.now()}`
    await db.insert(schema.numeration).values({
      id: numerationId,
      tenantId,
      resolution: input.resolution || 'TICKET-INTERNO-POS',
      prefix: input.prefix || 'REC',
      startRange: 1,
      endRange: 999999,
      currentNumber: 0,
      documentType: 'FACTURA_ELECTRONICA_VENTA'
    })
    numeration = await db.select().from(schema.numeration).where(eq(schema.numeration.id, numerationId)).limit(1)
  }

  const num = numeration[0]
  const nextNumber = getNextInvoiceNumber(num.currentNumber, num.startRange, num.endRange)

  if (!nextNumber.isValid) throw new Error(nextNumber.error)

  // Generate CUFE
  const invoiceNumber = formatInvoiceNumber(input.prefix, nextNumber.nextNumber)
  const cufe = generateCUFE(
    tenantId,
    invoiceNumber,
    new Date().toISOString().split('T')[0],
    new Date().toISOString().split('T')[0],
    sale[0].subtotal.toString(),
    sale[0].taxAmount.toString(),
    sale[0].subtotal.toString(),
    sale[0].total.toString(),
    'TEST_SOFTWARE',
    Math.random().toString(),
    'TEST_KEY'
  )

  // Fase 4.24 — consolidación fiscal: la reserva de consecutivo y el documento
  // viven SOLO en fiscal_document (antes: invoice_number + invoice). El CUFE local
  // NO se persiste: uniqueCode lo completa Factus en emitFactusElectronicInvoice.
  const existingDocs = await db
    .select()
    .from(schema.fiscalDocument)
    .where(eq(schema.fiscalDocument.saleId, input.saleId))
    .limit(1)
  const existingDoc = existingDocs[0]
  const invoiceId = existingDoc?.id ?? `fdoc_${Date.now()}`

  if (!existingDoc) {
    await db.insert(schema.fiscalDocument).values({
      id: invoiceId,
      tenantId,
      saleId: input.saleId,
      documentType: 'FACTURA_ELECTRONICA_VENTA',
      status: 'PENDING_GENERATION',
      prefix: input.prefix,
      consecutive: String(nextNumber.nextNumber),
      fullNumber: invoiceNumber,
      issueDate: new Date(),
    })
  } else if (!existingDoc.uniqueCode) {
    // Documento local pendiente de transmisión: completa los datos del consecutivo.
    await db
      .update(schema.fiscalDocument)
      .set({
        prefix: input.prefix,
        consecutive: String(nextNumber.nextNumber),
        fullNumber: invoiceNumber,
      })
      .where(eq(schema.fiscalDocument.id, existingDoc.id))
  }

  // Update numeration
  await db
    .update(schema.numeration)
    .set({ currentNumber: nextNumber.nextNumber })
    .where(eq(schema.numeration.id, num.id))

  await logAudit(tenantId, userId, AuditAction.CREATE, 'invoice', invoiceId, { cufe, invoiceNumber })
  await publishEvent(tenantId, EventType.INVOICE_GENERATED, 'invoice', invoiceId, { cufe, invoiceNumber })

  revalidatePath('/pos')
  return { invoiceId, cufe, invoiceNumber, success: true }
}

