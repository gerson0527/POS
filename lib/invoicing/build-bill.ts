// build-bill.ts — Convierte entidades del POS (venta, ítems, cliente, tenant) al InvoicePayload genérico.
// Aquí NO se hace ninguna llamada a Factus ni a DIAN, solo se traduce el modelo interno al formato del proveedor.
//
// Fase 4.25 (§7.1): separado en capas testables —
//   loadInvoiceContext()   → única parte con acceso a BD (impura)
//   buildCustomerPayload / buildItems / buildPayments / computeExactInvoiceTotal → puras y exportadas
// Los mapeos vienen de factus-mappers.ts (rompe la dependencia invertida sobre FactusProvider).

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import {
  InvoiceCustomerPayload,
  InvoiceItemPayload,
  InvoiceItemTaxPayload,
  InvoicePayload,
  InvoicePaymentDetailPayload,
} from './types'
import { mapDocumentType, mapTax, toMoneyString, toPaymentDetail } from './factus-mappers'

const DEFAULT_UMA_CODE = '94'
const DEFAULT_STANDARD_CODE = '999'
const DEFAULT_SCHEME_ID = '0'
const DEFAULT_NUMERATION_RANGE_ID = 0

/** Fecha de vencimiento por defecto para pagos a crédito (15 días desde la venta). */
function creditDueDate(saleCreatedAt?: Date | string | null): string | undefined {
  const base = saleCreatedAt ? new Date(saleCreatedAt) : new Date()
  if (Number.isNaN(base.getTime())) return undefined
  const due = new Date(base.getTime() + 15 * 24 * 60 * 60 * 1000)
  return due.toISOString().slice(0, 10)
}

interface BuildContext {
  tenant: {
    id: string
    nit: string
    numberingRangeId: number
    numberingPrefix: string
    municipalityCode?: string
    tributeCode?: string
  }
}

/** Separa NIT y dígito de verificación (DV). */
export function splitNit(rawNumber: string): { nit: string; dv: string } {
  const trimmed = (rawNumber || '').replace(/[\s.-]/g, '')
  // NIT colombiano: 123456789-0, "1234567890" sin DV, etc.
  if (trimmed.length > 9) {
    return { nit: trimmed.slice(0, -1), dv: trimmed.slice(-1) }
  }
  return { nit: trimmed, dv: '' }
}

/** Construye el InvoiceCustomerPayload a partir del customer + tenant. */
export function buildCustomerPayload(
  customer: any,
  tenantMunicipality: string,
  tenantTribute: string
): InvoiceCustomerPayload {
  const docCode = customer.identificationDocumentCode || mapDocumentType(customer.documentType || 'CC')
  const isCompany = (customer.personType || 'NATURAL').toUpperCase() === 'JURIDICA' || docCode === '31'
  const legalOrg = customer.legalOrganizationCode || (isCompany ? '1' : '2')

  const { nit, dv } = docCode === '31' ? splitNit(customer.documentNumber || '') : { nit: customer.documentNumber || '', dv: '' }

  return {
    identification_document_code: docCode,
    identification: nit,
    dv: dv || undefined,
    company: isCompany ? customer.name || '' : undefined,
    trade_name: customer.tradeName || undefined,
    names: isCompany ? undefined : (customer.name || '').split(' ')[0] || undefined,
    surnames: isCompany
      ? undefined
      : (customer.name || '').split(' ').slice(1).join(' ') || undefined,
    address: customer.address || 'Sin dirección registrada',
    email: customer.email || 'no-email@posretail.local',
    phone: customer.phone || undefined,
    legal_organization_code: legalOrg,
    tribute_code: customer.tributeCode || tenantTribute || 'ZZ',
    municipality_code: customer.municipalityCode || tenantMunicipality || '11001',
  }
}

/** Construye los ítems a partir de los sale_items + product.
 *  Cada fila de `itemsRows` tiene la forma `{ item: saleItem, product: product|null }`
 *  (por el .select({ item, product }) con leftJoin). Los campos del sale_item
 *  viven en `it.item.*`, NO directamente en `it`. */
export function buildItems(items: any[]): InvoiceItemPayload[] {
  return items.map((row) => {
    const it = row.item ?? {}
    const product = row.product ?? {}
    const ivaRate = it.ivaRate ?? product.ivaRate ?? 19
    const iva = mapTax(ivaRate)
    const taxes: InvoiceItemTaxPayload[] = []
    if (Number(ivaRate ?? 0) > 0) taxes.push(iva)
    else taxes.push({ code: '01', rate: '0.00', is_excluded: true })

    return {
      code_reference:
        product.sku ||
        it.productId?.substring(0, 10) ||
        `PROD-${it.id?.slice(-6) || Math.random().toString(36).slice(2, 8)}`,
      name: product.name || it.productName || 'Producto POS',
      quantity: Number(it.quantity),
      price: Number(it.unitPrice),
      discount_rate: 0,
      unit_measure_code: product.unitMeasureCode || DEFAULT_UMA_CODE,
      standard_code: product.standardCode || DEFAULT_STANDARD_CODE,
      scheme_id: product.schemeId || DEFAULT_SCHEME_ID,
      taxes,
    }
  })
}

/** Construye los payment_details a partir de los payments.
 *  `invoiceTotal` es el total EXACTO de la factura (suma de ítems + IVA).
 *  DIAN exige que la suma de payment_details == total de factura; el POS redondea
 *  el cobro en efectivo a la centena, así que reconciliamos aquí el monto. */
export function buildPayments(
  payments: any[],
  invoiceTotal: number,
  saleCreatedAt?: Date | string | null
): InvoicePaymentDetailPayload[] {
  if (!payments || payments.length === 0) {
    return [{ payment_form: '1', payment_method_code: '10', amount: toMoneyString(invoiceTotal) }]
  }
  if (payments.length === 1) {
    const p = payments[0]
    // Un solo pago: el monto debe cuadrar con el total exacto de la factura.
    const amount = invoiceTotal > 0 ? invoiceTotal : Number(p.amount)
    const detail = toPaymentDetail(p.method, amount, p.reference)
    // Pago a crédito (payment_form = '2'): DIAN exige fecha de vencimiento.
    if (detail.payment_form === '2' && !detail.due_date) {
      detail.due_date = p.dueDate || creditDueDate(saleCreatedAt)
    }
    return [detail]
  }
  // Multi-pago: reconciliamos la diferencia de redondeo en el primer pago en efectivo
  // (o en el primero) para que la suma cuadre con el total exacto de la factura.
  const details = payments.map((p) => {
    const detail = toPaymentDetail(p.method, Number(p.amount), p.reference)
    if (detail.payment_form === '2' && !detail.due_date) {
      detail.due_date = p.dueDate || creditDueDate(saleCreatedAt)
    }
    return detail
  })
  const sumPayments = details.reduce((s, d) => s + Number(d.amount || 0), 0)
  const diff = Number((invoiceTotal - sumPayments).toFixed(2))
  if (diff !== 0 && details.length > 0) {
    const idx = details.findIndex((d) => d.payment_method_code === '10') // efectivo
    const target = idx >= 0 ? idx : 0
    details[target].amount = toMoneyString(Number(details[target].amount) + diff)
  }
  return details
}

/**
 * Total EXACTO de la factura según DIAN: suma de (cantidad × precio + IVA) por ítem.
 * El POS redondea sale.total a la centena ($100) como convenio de caja, pero la
 * factura electrónica debe cuadrar exactamente con la suma de los ítems; si no,
 * Factus rechaza con 422 ("La suma de detalles de pago no es igual al total").
 */
export function computeExactInvoiceTotal(itemsRows: any[]): number {
  const itemsForTotal = itemsRows.map((row) => ({
    quantity: Number(row.item.quantity ?? 0),
    unitPrice: Number(row.item.unitPrice ?? 0),
    ivaRate: Number(row.item.ivaRate ?? row.product?.ivaRate ?? 0),
  }))
  return Number(
    itemsForTotal
      .reduce((sum, it) => {
        const lineSubtotal = it.quantity * it.unitPrice
        return sum + lineSubtotal * (1 + it.ivaRate / 100)
      }, 0)
      .toFixed(2)
  )
}

/** Carga venta + tenant + ítems + pagos desde la BD (única parte impura). */
export async function loadInvoiceContext(saleId: string): Promise<{
  sale: any
  tenant: any
  ctx: BuildContext
  itemsRows: any[]
  paymentsRows: any[]
}> {
  // Cargar venta
  const saleRows = await db.select().from(schema.sale).where(eq(schema.sale.id, saleId)).limit(1)
  const sale = saleRows[0]
  if (!sale) throw new Error('Venta no encontrada al construir la factura')

  // Cargar tenant
  const tenantRows = await db.select().from(schema.tenant).where(eq(schema.tenant.id, sale.tenantId)).limit(1)
  const tenant: any = tenantRows[0] || { id: sale.tenantId, nit: '' }
  const ctx: BuildContext = {
    tenant: {
      id: tenant.id,
      nit: tenant.nit || '',
      numberingRangeId: Number(tenant.factusNumberingRangeId ?? DEFAULT_NUMERATION_RANGE_ID),
      numberingPrefix: 'FACT',
      municipalityCode: '11001',
      tributeCode: 'ZZ',
    },
  }

  // Cargar ítems + producto (necesitamos unit_measure_code, etc.)
  const itemsRows = await db
    .select({
      item: schema.saleItem,
      product: schema.product,
    })
    .from(schema.saleItem)
    .leftJoin(schema.product, eq(schema.saleItem.productId, schema.product.id))
    .where(eq(schema.saleItem.saleId, saleId))

  // Cargar pagos
  const paymentsRows = await db
    .select()
    .from(schema.payment)
    .where(eq(schema.payment.saleId, saleId))

  return { sale, tenant, ctx, itemsRows, paymentsRows }
}

/** Construye el InvoicePayload completo. */
export async function buildInvoicePayload(input: {
  saleId: string
  operationType?: string
}): Promise<InvoicePayload> {
  const { sale, ctx, itemsRows, paymentsRows } = await loadInvoiceContext(input.saleId)

  const exactInvoiceTotal = computeExactInvoiceTotal(itemsRows)

  // Cargar cliente (puede venir del sale o ser "consumidor final")
  const customer = sale.customerDocNumber
    ? {
        documentType: sale.customerDocType || 'CC',
        documentNumber: sale.customerDocNumber || '',
        personType: 'NATURAL',
        name: sale.customerName || 'Consumidor Final',
        email: sale.customerEmail || null,
        phone: sale.customerPhone || null,
        address: sale.customerAddress || null,
        tributeCode: 'ZZ',
        legalOrganizationCode: '2',
        municipalityCode: '11001',
        identificationDocumentCode: null,
      }
    : null

  return {
    numbering_range_id: ctx.tenant.numberingRangeId,
    reference_code: `FACT-${sale.ticketNumber ?? Date.now()}`,
    document: '01',
    operation_type: input.operationType ?? '10',
    send_email: Boolean(sale.customerEmail),
    observation: 'Factura emitida automáticamente desde POS Retail',
    payment_details: buildPayments(paymentsRows, exactInvoiceTotal || Number(sale.total ?? 0), sale.createdAt),
    customer: customer
      ? buildCustomerPayload(customer, ctx.tenant.municipalityCode || '11001', ctx.tenant.tributeCode || 'ZZ')
      : buildCustomerPayload(
          {
            documentType: 'CC',
            documentNumber: '222222222222',
            personType: 'NATURAL',
            name: 'Consumidor Final',
            address: 'Calle 100 # 15-20',
            email: 'no-email@posretail.local',
            phone: '3000000000',
          },
          '11001',
          'ZZ'
        ),
    items: buildItems(itemsRows),
  } as InvoicePayload
}
