'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { eq, desc, inArray, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUserId, getTenantId, formatBogotaDateTime, logAudit, requireRole } from './_shared'
import { dianQrUrl } from '@/lib/fiscal/cufe'
import { calculateSaleTotals } from '@/lib/utils/pos-utils'
import { isAllowedIvaRate } from '@/lib/auth/permissions'
import { AuditAction, SaleStatus } from '@/lib/types'
export async function getAllInvoices() {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const tenantRows = await db
    .select({
      legalName: schema.tenant.legalName,
      nit: schema.tenant.nit,
      tradeName: schema.tenant.tradeName,
      address: schema.tenant.address,
      city: schema.tenant.city,
      factusEnvironment: schema.tenant.factusEnvironment,
    })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, tenantId))
    .limit(1)
  const tenantRow = tenantRows[0]

  const company = {
    legalName: tenantRow?.legalName || 'Comercializadora POS Retail S.A.S.',
    nit: tenantRow?.nit || '',
    tradeName: tenantRow?.tradeName || null,
    address: tenantRow?.address || null,
    city: tenantRow?.city || null,
  }
  const dianEnvironment = tenantRow?.factusEnvironment || 'sandbox'

  // Las fechas se formatean AQUÍ (zona horaria explícita) porque al serializarlas al
  // cliente se perdía la hora local y el comprobante mostraba -5 horas.
  const fmtDateTime = formatBogotaDateTime

  const sales = await db
    .select()
    .from(schema.sale)
    .where(eq(schema.sale.tenantId, tenantId))
    .orderBy(desc(schema.sale.createdAt))

  if (!sales.length) return []

  // Fase 3.19: batches con inArray — elimina el N+1 (antes 1 + 3N queries).
  const saleIds = sales.map((s) => s.id)

  const allPayments = await db
    .select()
    .from(schema.payment)
    .where(inArray(schema.payment.saleId, saleIds))

  const allItems = await db
    .select({
      id: schema.saleItem.id,
      saleId: schema.saleItem.saleId,
      productId: schema.saleItem.productId,
      productName: schema.product.name,
      productSku: schema.product.sku,
      quantity: schema.saleItem.quantity,
      unitPrice: schema.saleItem.unitPrice,
      ivaRate: schema.saleItem.ivaRate,
      ivaAmount: schema.saleItem.ivaAmount,
      lineTotal: schema.saleItem.lineTotal,
    })
    .from(schema.saleItem)
    .leftJoin(schema.product, eq(schema.saleItem.productId, schema.product.id))
    .where(inArray(schema.saleItem.saleId, saleIds))

  const allFiscalDocs = await db
    .select()
    .from(schema.fiscalDocument)
    .where(inArray(schema.fiscalDocument.saleId, saleIds))

  const paymentsBySale = new Map<string, typeof allPayments>()
  for (const p of allPayments) {
    const arr = paymentsBySale.get(p.saleId)
    if (arr) arr.push(p)
    else paymentsBySale.set(p.saleId, [p])
  }

  const itemsBySale = new Map<string, typeof allItems>()
  for (const it of allItems) {
    const arr = itemsBySale.get(it.saleId)
    if (arr) arr.push(it)
    else itemsBySale.set(it.saleId, [it])
  }

  const fiscalBySale = new Map<string, (typeof allFiscalDocs)[number]>()
  for (const fd of allFiscalDocs) {
    if (fd.saleId && !fiscalBySale.has(fd.saleId)) fiscalBySale.set(fd.saleId, fd)
  }

  const mapMethodName = (m: string) => {
    if (!m || m === 'CASH' || m === 'EFECTIVO') return 'EFECTIVO'
    if (m === 'NEQUI') return 'NEQUI'
    if (m === 'TRANSFER' || m === 'TRANSFERENCIA') return 'TRANSFERENCIA'
    if (m === 'CREDIT_CARD' || m === 'TARJETA_CREDITO') return 'T. CRÉDITO'
    if (m === 'DEBIT_CARD' || m === 'TARJETA_DEBITO') return 'T. DÉBITO'
    return m
  }

  const invoices = sales.map((s) => {
    const payments = paymentsBySale.get(s.id) || []
    const items = itemsBySale.get(s.id) || []

    const primaryPayment = payments[0] || null
    const paymentMethodsList = Array.from(new Set(payments.map((p) => p.method)))

    const mappedMethods = paymentMethodsList.map(mapMethodName)
    const paymentMethodLabel =
      mappedMethods.length > 1
        ? `MIXTO (${mappedMethods.join(' + ')})`
        : primaryPayment
        ? mapMethodName(primaryPayment.method)
        : 'SIN PAGO'

    const paymentReferenceLabel =
      primaryPayment?.reference ? primaryPayment.reference : ''

    const fiscalDoc = fiscalBySale.get(s.id) || null

    return {
      ...s,
      createdAtDisplay: fmtDateTime(s.createdAt),
      completedAtDisplay: fmtDateTime(s.completedAt),
      company,
      dianEnvironment,
      paymentMethod: paymentMethodLabel,
      paymentMethodsList,
      paymentReference: paymentReferenceLabel,
      payments,
      items,
      fiscalDocument: fiscalDoc,
      isElectronicSent: Boolean(fiscalDoc?.uniqueCode),
      dianStatus: fiscalDoc?.status || null,
      cufe: fiscalDoc?.uniqueCode || null,
      xmlUrl: fiscalDoc?.xmlSignedStorageKey || null,
      pdfUrl: fiscalDoc?.pdfStorageKey || null,
      // Fallback: si el QR no quedó guardado (facturas anteriores al fix de
      // qrCodeUrl), se deriva desde el CUFE — documentkey del catálogo DIAN es el CUFE.
      qrUrl:
        fiscalDoc?.qrCodeContent ||
        (fiscalDoc?.uniqueCode ? dianQrUrl(fiscalDoc.uniqueCode, dianEnvironment) : null),
      fullNumber: fiscalDoc?.fullNumber || null,
    }
  })

  return invoices
}

/**
 * Emite una Factura Electrónica de Venta oficial ante la DIAN utilizando la API V2 de Factus
 */

/**
 * AJUSTE FISCAL DE IVA sobre una factura PENDIENTE.
 *
 * Cuando el vendedor carga el producto con una tarifa de IVA equivocada, la
 * factura queda pendiente y la contadora (rol ACCOUNTANT) corrige la tarifa
 * antes de transmitirla a la DIAN. Reglas:
 *  - Sólo facturas NO transmitidas (sin CUFE): un documento con CUFE ya es
 *    un documento fiscal y requiere nota de crédito, no edición.
 *  - Sólo ventas completadas.
 *  - Recalcula IVA de la línea, total de la línea y totales de la venta.
 *  - Devuelve la diferencia entre el nuevo total y lo efectivamente cobrado,
 *    para que la contadora gestione la diferencia en caja.
 */
export async function updateSaleItemTax(input: {
  saleId: string
  saleItemId: string
  ivaRate: number
}): Promise<{
  success: boolean
  message: string
  totals?: { subtotal: number; taxAmount: number; total: number; discountAmount: number }
  paymentDelta?: number
}> {
  try {
    const userId = await getUserId()
    await requireRole(userId, ['ADMIN', 'MANAGER', 'ACCOUNTANT'])
    const tenantId = await getTenantId(userId)

    const rate = Number(input.ivaRate)
    if (!isAllowedIvaRate(rate)) {
      return { success: false, message: 'Tarifa de IVA no permitida. Use 0, 5, 8 o 19.' }
    }

    const saleRows = await db
      .select()
      .from(schema.sale)
      .where(and(eq(schema.sale.id, input.saleId), eq(schema.sale.tenantId, tenantId)))
      .limit(1)
    const sale = saleRows[0]
    if (!sale) return { success: false, message: 'La venta no existe.' }
    if (sale.status !== SaleStatus.COMPLETED) {
      return { success: false, message: 'Sólo se puede ajustar el IVA de ventas completadas.' }
    }

    // Si ya tiene CUFE el documento ya es fiscal: no se edita (exige nota crédito).
    const docRows = await db
      .select()
      .from(schema.fiscalDocument)
      .where(
        and(
          eq(schema.fiscalDocument.saleId, sale.id),
          eq(schema.fiscalDocument.tenantId, tenantId)
        )
      )
      .orderBy(desc(schema.fiscalDocument.createdAt))
      .limit(1)
    if (docRows[0]?.uniqueCode) {
      return {
        success: false,
        message:
          'La factura ya fue transmitida a la DIAN (tiene CUFE). No se puede modificar: requiere nota de crédito.',
      }
    }

    const itemRows = await db
      .select()
      .from(schema.saleItem)
      .where(
        and(eq(schema.saleItem.id, input.saleItemId), eq(schema.saleItem.saleId, sale.id))
      )
      .limit(1)
    const item = itemRows[0]
    if (!item) return { success: false, message: 'El ítem de la venta no existe.' }

    const oldRate = Number(item.ivaRate || 0)
    if (oldRate === rate) {
      return { success: true, message: 'La tarifa de IVA ya era la misma.' }
    }

    const quantity = Number(item.quantity)
    const unitPrice = Number(item.unitPrice)
    const lineSubtotal = quantity * unitPrice
    const ivaAmount = lineSubtotal * (rate / 100)
    const lineTotal = lineSubtotal + ivaAmount

    await db
      .update(schema.saleItem)
      .set({
        ivaRate: rate.toFixed(2),
        ivaAmount: ivaAmount.toFixed(2),
        lineTotal: lineTotal.toFixed(2),
      })
      .where(eq(schema.saleItem.id, item.id))

    // Recalcular totales de la venta con la tarifa ya aplicada.
    const allItems = await db
      .select()
      .from(schema.saleItem)
      .where(eq(schema.saleItem.saleId, sale.id))
    const totals = calculateSaleTotals(
      allItems.map((i) => ({
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        ivaRate: Number(i.ivaRate),
      })),
      Number(sale.discountPercentage || 0)
    )

    await db
      .update(schema.sale)
      .set({
        subtotal: totals.subtotal.toString(),
        taxAmount: totals.taxAmount.toString(),
        total: totals.total.toString(),
        discountAmount: totals.discountAmount.toString(),
        updatedAt: new Date(),
      })
      .where(eq(schema.sale.id, sale.id))

    // Diferencia contra lo cobrado: queda visible para la contadora.
    const payments = await db
      .select()
      .from(schema.payment)
      .where(eq(schema.payment.saleId, sale.id))
    const paidTotal = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    const paymentDelta = Number((totals.total - paidTotal).toFixed(2))

    await logAudit(tenantId, userId, AuditAction.UPDATE, 'sale_item_tax', item.id, {
      saleId: sale.id,
      productId: item.productId,
      ivaRateAnterior: oldRate,
      ivaRateNuevo: rate,
      totalAnterior: Number(sale.total || 0),
      totalNuevo: totals.total,
      diferenciaCobro: paymentDelta,
    })

    revalidatePath('/dashboard/invoices')

    return {
      success: true,
      message:
        paymentDelta === 0
          ? `IVA ajustado a ${rate}%.`
          : `IVA ajustado a ${rate}%. El total de la factura cambió en $${Math.abs(paymentDelta).toLocaleString('es-CO')}: la diferencia debe gestionarse en caja.`,
      totals,
      paymentDelta,
    }
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'No se pudo ajustar el IVA de la factura.',
    }
  }
}
