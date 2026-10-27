'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { eq, desc, inArray } from 'drizzle-orm'
import { getUserId, getTenantId, formatBogotaDateTime } from './_shared'
import { dianQrUrl } from '@/lib/fiscal/cufe'
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