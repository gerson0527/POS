'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { eq, desc, inArray } from 'drizzle-orm'
import { getUserId, getTenantId, formatBogotaDateTime } from './_shared'
import { dianQrUrl } from '@/lib/fiscal/cufe'
import { getInvoiceProvider } from '@/lib/invoicing'
export async function getAllInvoices() {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)
  const electronicInvoicingEnabled = Boolean(await getInvoiceProvider(tenantId))

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

  const allOutbox = await db
    .select()
    .from(schema.fiscalOutbox)
    .where(inArray(schema.fiscalOutbox.saleId, saleIds))

  const userIds = Array.from(new Set(sales.map((s) => s.userId).filter(Boolean)))
  const locationIds = Array.from(new Set(sales.map((s) => s.locationId).filter(Boolean)))
  const sessionIds = Array.from(
    new Set(sales.map((s) => s.cashierSessionId).filter(Boolean))
  )

  const [allUsers, allLocations, allSessions] = await Promise.all([
    userIds.length
      ? db
          .select({ id: schema.user.id, name: schema.user.name })
          .from(schema.user)
          .where(inArray(schema.user.id, userIds))
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    locationIds.length
      ? db
          .select({
            id: schema.location.id,
            name: schema.location.name,
            city: schema.location.city,
            code: schema.location.code,
          })
          .from(schema.location)
          .where(inArray(schema.location.id, locationIds))
      : Promise.resolve(
          [] as Array<{ id: string; name: string; city: string | null; code: string }>
        ),
    sessionIds.length
      ? db
          .select({
            id: schema.cashierSession.id,
            businessDate: schema.cashierSession.businessDate,
            status: schema.cashierSession.status,
          })
          .from(schema.cashierSession)
          .where(inArray(schema.cashierSession.id, sessionIds))
      : Promise.resolve(
          [] as Array<{ id: string; businessDate: string | Date; status: string }>
        ),
  ])

  const userById = new Map(allUsers.map((u) => [u.id, u]))
  const locationById = new Map(allLocations.map((l) => [l.id, l]))
  const sessionById = new Map(allSessions.map((s) => [s.id, s]))

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

  // Puede haber dos filas por venta: el comprobante interno REC y la factura
  // electrónica. La UI debe mostrar SIEMPRE el documento electrónico (CUFE).
  const fiscalRank = (fd: (typeof allFiscalDocs)[number]) => {
    if (fd.uniqueCode) return 3
    if (fd.documentType === 'FACTURA_ELECTRONICA_VENTA') return 2
    return 1
  }
  const fiscalBySale = new Map<string, (typeof allFiscalDocs)[number]>()
  for (const fd of allFiscalDocs) {
    if (!fd.saleId) continue
    const current = fiscalBySale.get(fd.saleId)
    if (!current || fiscalRank(fd) > fiscalRank(current)) {
      fiscalBySale.set(fd.saleId, fd)
    }
  }

  const outboxBySale = new Map<string, (typeof allOutbox)[number]>()
  for (const ob of allOutbox) {
    if (ob.eventType === 'EMIT_INVOICE') outboxBySale.set(ob.saleId, ob)
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
    const outbox = outboxBySale.get(s.id) || null
    const cashier = userById.get(s.userId)
    const loc = locationById.get(s.locationId)
    const cashSession = sessionById.get(s.cashierSessionId)
    const businessDateRaw = cashSession?.businessDate
    const businessDate =
      businessDateRaw instanceof Date
        ? businessDateRaw.toISOString().slice(0, 10)
        : businessDateRaw
          ? String(businessDateRaw).slice(0, 10)
          : null

    // Snapshot fiscal: reconstruye la factura con los datos EXACTOS enviados a
    // DIAN (nombre/SKU/precio de ese momento), no con el catálogo actual.
    const snapshotItems = Array.isArray(fiscalDoc?.itemsSnapshot)
      ? (fiscalDoc.itemsSnapshot as any[]).map((item, index) => {
          const quantity = Number(item.quantity ?? 0)
          const price = Number(item.price ?? 0)
          const rate = Number(item.taxes?.[0]?.rate ?? 0)
          const base = quantity * price
          const ivaAmount = base * (rate / 100)
          return {
            id: `snapshot_${s.id}_${index}`,
            saleId: s.id,
            productId: item.code_reference || null,
            productName: item.name || 'Producto POS',
            productSku: item.code_reference || null,
            quantity,
            unitPrice: price,
            ivaRate: rate,
            ivaAmount,
            lineTotal: base + ivaAmount,
          }
        })
      : null

    const qrUrl =
      fiscalDoc?.qrCodeContent ||
      (fiscalDoc?.uniqueCode ? dianQrUrl(fiscalDoc.uniqueCode, dianEnvironment) : null)

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
      items: snapshotItems?.length ? snapshotItems : items,
      fiscalDocument: fiscalDoc,
      isElectronicSent: Boolean(fiscalDoc?.uniqueCode),
      dianStatus: fiscalDoc?.status || null,
      cufe: fiscalDoc?.uniqueCode || null,
      xmlUrl: fiscalDoc?.xmlSignedStorageKey || null,
      pdfUrl: fiscalDoc?.pdfStorageKey || null,
      // Fallback: si el QR no quedó guardado (facturas anteriores al fix de
      // qrCodeUrl), se deriva desde el CUFE — documentkey del catálogo DIAN es el CUFE.
      qrUrl,
      fullNumber: fiscalDoc?.fullNumber || null,
      hasPdf: Boolean(fiscalDoc?.pdfStorageKey),
      hasXml: Boolean(fiscalDoc?.xmlSignedStorageKey),
      hasQr: Boolean(qrUrl),
      cashierName: cashier?.name || null,
      locationName: loc?.name || loc?.city || loc?.code || null,
      locationCity: loc?.city || null,
      cashSessionBusinessDate: businessDate,
      cashSessionStatus: cashSession?.status || null,
      outboxStatus: outbox?.status || null,
      outboxLastError: outbox?.lastError || null,
      requiresManualApproval: outbox?.requiresManualApproval ?? false,
      needsReconciliation: outbox?.needsReconciliation ?? false,
      electronicInvoicingEnabled,
    }
  })

  return invoices
}