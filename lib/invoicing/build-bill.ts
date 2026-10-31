// build-bill.ts — Convierte entidades del POS (venta, ítems, cliente, tenant) al InvoicePayload genérico.
// Aquí NO se hace ninguna llamada a Factus ni a DIAN, solo se traduce el modelo interno al formato del proveedor.
//
// Fase 4.25 (§7.1): separado en capas testables —
//   loadInvoiceContext()   → única parte con acceso a BD (impura)
//   buildCustomerPayload / buildItems / buildPayments / computeExactInvoiceTotal / computeCashRoundingAmount → puras y exportadas
// Los mapeos vienen de factus-mappers.ts (rompe la dependencia invertida sobre FactusProvider).

import { and, eq } from 'drizzle-orm'
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
const DEFAULT_MUNICIPALITY_CODE = '11001'
const DEFAULT_TRIBUTE_CODE = 'ZZ'

/** Cliente genérico explícito para ventas sin identificación (consumidor final). */
export const FINAL_CONSUMER = {
  documentType: 'CC',
  documentNumber: '222222222222',
  personType: 'NATURAL',
  name: 'Consumidor Final',
  address: 'Calle 100 # 15-20',
  email: 'no-email@posretail.local',
  phone: '3000000000',
} as const

interface BuildContext {
  tenant: {
    id: string
    nit: string
    numberingRangeId: number
    numberingPrefix: string
    municipalityCode?: string
    tributeCode?: string
    address?: string
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
export function buildItems(items: any[], discountPercentage = 0): InvoiceItemPayload[] {
  const discountRate = Number.isFinite(discountPercentage)
    ? Math.min(100, Math.max(0, discountPercentage))
    : 0
  return items.map((row) => {
    const it = row.item ?? {}
    const product = row.product ?? {}
    const ivaRate = it.ivaRate ?? product.ivaRate ?? 19
    const taxTreatment = it.taxTreatment ?? product.taxTreatment ?? 'TAXED'
    const taxes: InvoiceItemTaxPayload[] = [mapTax(ivaRate, taxTreatment)]

    return {
      code_reference:
        product.sku ||
        it.productId?.substring(0, 10) ||
        `PROD-${it.id?.slice(-6) || Math.random().toString(36).slice(2, 8)}`,
      name: product.name || it.productName || 'Producto POS',
      quantity: Number(it.quantity),
      price: Number(it.unitPrice),
      discount_rate: discountRate,
      unit_measure_code: product.unitMeasureCode || DEFAULT_UMA_CODE,
      standard_code: product.standardCode || DEFAULT_STANDARD_CODE,
      scheme_id: product.schemeId || DEFAULT_SCHEME_ID,
      taxes,
    }
  })
}

/** Construye los payment_details a partir de los payments.
 *  `invoiceTotal` es el total objetivo de la factura (exacto + redondeo de caja).
 *  DIAN exige que la suma de payment_details == total de factura; el POS redondea
 *  el cobro en efectivo a la centena, así que reconciliamos aquí el monto. */
export function buildPayments(payments: any[], invoiceTotal: number): InvoicePaymentDetailPayload[] {
  if (!payments || payments.length === 0) {
    return [{ payment_form: '1', payment_method_code: '10', amount: toMoneyString(invoiceTotal) }]
  }
  if (payments.length === 1) {
    const p = payments[0]
    // Un solo pago: el monto debe cuadrar con el total objetivo de la factura.
    const amount = invoiceTotal > 0 ? invoiceTotal : Number(p.amount)
    return [toPaymentDetail(p.method, amount, p.reference)]
  }
  // Multi-pago: reconciliamos la diferencia de redondeo en el primer pago en efectivo
  // (o en el primero) para que la suma cuadre con el total exacto de la factura.
  const details = payments.map((p) => toPaymentDetail(p.method, Number(p.amount), p.reference))
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
 * El POS redondea sale.total a la centena ($100) como convenio de caja; esa
 * diferencia se envía a Factus como `cash_rounding_amount` (ver
 * computeCashRoundingAmount) para que el total electrónico coincida con el cobro.
 */
export function computeExactInvoiceTotal(itemsRows: any[], discountPercentage = 0): number {
  const discountFactor =
    1 - Math.min(100, Math.max(0, Number(discountPercentage) || 0)) / 100
  const itemsForTotal = itemsRows.map((row) => ({
    quantity: Number(row.item.quantity ?? 0),
    unitPrice: Number(row.item.unitPrice ?? 0),
    ivaRate: Number(row.item.ivaRate ?? row.product?.ivaRate ?? 0),
  }))
  return Number(
    itemsForTotal
      .reduce((sum, it) => {
        const lineSubtotal = it.quantity * it.unitPrice
        return sum + lineSubtotal * (1 + it.ivaRate / 100) * discountFactor
      }, 0)
      .toFixed(2)
  )
}

/**
 * Ajuste de redondeo de caja para Factus (`cash_rounding_amount`).
 *
 * Factus calcula el total con los ítems y le suma este ajuste; el resultado debe
 * coincidir con la suma de `payment_details` (el cobro real del POS). Como el POS
 * redondea a la centena, la diferencia es como máximo ±50; si es mayor, no es un
 * redondeo sino una inconsistencia (p. ej. descuentos no reflejados en ítems) y
 * se devuelve 0 para no enviar un ajuste inválido.
 */
export function computeCashRoundingAmount(exactInvoiceTotal: number, posTotal: number): number {
  const diff = Number((posTotal - exactInvoiceTotal).toFixed(2))
  if (!Number.isFinite(diff) || Math.abs(diff) > 50) return 0
  return diff
}

/**
 * Carga venta + tenant + ítems + pagos desde la BD (única parte impura).
 * `numberingRangeId` permite usar el rango ya resuelto por el provider
 * (.env + override del tenant); si no se pasa, se lee el del tenant.
 */
export async function loadInvoiceContext(
  saleId: string,
  numberingRangeId?: number,
  tenantId?: string
): Promise<{
  sale: any
  tenant: any
  customerRow: any | null
  ctx: BuildContext
  itemsRows: any[]
  paymentsRows: any[]
}> {
  // Cargar venta (si se conoce el tenant, se exige que coincida)
  const saleRows = await db
    .select()
    .from(schema.sale)
    .where(
      tenantId
        ? and(eq(schema.sale.id, saleId), eq(schema.sale.tenantId, tenantId))
        : eq(schema.sale.id, saleId)
    )
    .limit(1)
  const sale = saleRows[0]
  if (!sale) throw new Error('Venta no encontrada al construir la factura')

  // Cargar tenant
  const tenantRows = await db.select().from(schema.tenant).where(eq(schema.tenant.id, sale.tenantId)).limit(1)
  const tenant: any = tenantRows[0] || { id: sale.tenantId, nit: '' }
  const ctx: BuildContext = {
    tenant: {
      id: tenant.id,
      nit: tenant.nit || '',
      numberingRangeId: Number(numberingRangeId ?? tenant.factusNumberingRangeId ?? 0),
      numberingPrefix: 'FACT',
      municipalityCode: tenant.fiscalMunicipalityCode || DEFAULT_MUNICIPALITY_CODE,
      tributeCode: tenant.fiscalTributeCode || DEFAULT_TRIBUTE_CODE,
      address: tenant.address || undefined,
    },
  }

  // Vincular el cliente real (si existe) para usar municipio, tributo y tipo de
  // persona configurados en vez de defaults genéricos.
  let customerRow: any | null = null
  if (sale.customerDocNumber) {
    const customerRows = await db
      .select()
      .from(schema.customer)
      .where(
        and(
          eq(schema.customer.tenantId, sale.tenantId),
          eq(schema.customer.documentNumber, sale.customerDocNumber)
        )
      )
      .limit(1)
    customerRow = customerRows[0] ?? null
  }

  // Cargar ítems + producto (necesitamos unit_measure_code, etc.)
  const itemsRows = await db
    .select({
      item: schema.saleItem,
      product: schema.product,
    })
    .from(schema.saleItem)
    .leftJoin(
      schema.product,
      and(
        eq(schema.saleItem.productId, schema.product.id),
        eq(schema.product.tenantId, sale.tenantId)
      )
    )
    .where(eq(schema.saleItem.saleId, saleId))

  // Cargar pagos
  const paymentsRows = await db
    .select()
    .from(schema.payment)
    .where(eq(schema.payment.saleId, saleId))

  return { sale, tenant, customerRow, ctx, itemsRows, paymentsRows }
}

/**
 * Validaciones previas a llamar a Factus. Devuelve una lista de errores
 * accionables (vacía si todo está correcto). No inventa datos: si la venta
 * tiene cliente identificado, exige los campos que el proveedor necesita.
 */
export function validateInvoiceContext(input: {
  sale: any
  itemsRows: any[]
  paymentsRows: any[]
  customerRow: any | null
  ctx: BuildContext
}): string[] {
  const errors: string[] = []
  const { sale, itemsRows, paymentsRows, customerRow, ctx } = input

  if (String(sale?.status || '').toUpperCase() !== 'COMPLETED') {
    errors.push('La venta debe estar COMPLETADA para emitir factura electrónica.')
  }
  if (!itemsRows.length) {
    errors.push('La venta no tiene ítems para facturar.')
  }
  if (!Number.isInteger(ctx.tenant.numberingRangeId) || ctx.tenant.numberingRangeId <= 0) {
    errors.push(
      'No hay rango de numeración electrónica configurado. Configúrelo en /dashboard/settings → Facturación electrónica.'
    )
  }

  itemsRows.forEach((row, index) => {
    const it = row.item ?? {}
    const quantity = Number(it.quantity)
    const unitPrice = Number(it.unitPrice)
    const ivaRate = Number(it.ivaRate ?? row.product?.ivaRate ?? 0)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push(`Ítem ${index + 1}: cantidad inválida (${it.quantity ?? 'vacía'}).`)
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      errors.push(`Ítem ${index + 1}: precio unitario inválido (${it.unitPrice ?? 'vacío'}).`)
    }
    if (!Number.isFinite(ivaRate) || ivaRate < 0) {
      errors.push(`Ítem ${index + 1}: tarifa de IVA inválida (${it.ivaRate ?? 'vacía'}).`)
    }
  })

  if (!paymentsRows.length) {
    errors.push('La venta no tiene pagos registrados; no se puede emitir la factura.')
  }
  paymentsRows.forEach((payment, index) => {
    const amount = Number(payment.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push(`Pago ${index + 1}: monto inválido (${payment.amount ?? 'vacío'}).`)
    }
  })

  const municipalityCode = String(
    customerRow?.municipalityCode || ctx.tenant.municipalityCode || ''
  )
  if (!/^\d{5}$/.test(municipalityCode)) {
    errors.push(
      'Falta un código DANE de municipio válido (5 dígitos) para el cliente o el emisor.'
    )
  }

  // Consumidor final: registro genérico explícito.
  // Cliente identificado en mostrador: nombre + documento bastan para persona
  // natural (email/dirección suelen no pedirse en el POS). Persona jurídica
  // (NIT) sí exige email y dirección fiscales.
  if (sale?.customerDocNumber) {
    const name = customerRow?.name || sale.customerName
    const email = customerRow?.email || sale.customerEmail
    const address =
      customerRow?.address || sale.customerAddress || ctx.tenant.address || null
    const docType = String(
      customerRow?.documentType || sale.customerDocType || ''
    ).toUpperCase()
    const personType = String(customerRow?.personType || 'NATURAL').toUpperCase()
    const isCompany = personType === 'JURIDICA' || docType === 'NIT'
    if (!name) errors.push('El cliente no tiene nombre o razón social.')
    if (!docType && !customerRow?.identificationDocumentCode) {
      errors.push('El cliente no tiene tipo de documento.')
    }
    if (isCompany && !email) {
      errors.push('La persona jurídica necesita email para la factura electrónica.')
    }
    if (isCompany && !address) {
      errors.push('La persona jurídica necesita dirección fiscal registrada.')
    }
  }

  return errors
}

/**
 * reference_code ÚNICO y estable por venta para Factus.
 *
 * Factus garantiza idempotencia por `reference_code`: si se reenvía uno ya
 * procesado, devuelve la factura existente (no crea una nueva). Por eso NO se
 * puede derivar del ticketNumber (se repite tras resets/seed y en el sandbox
 * compartido colisiona con facturas de ejemplo, devolviendo otro cliente/ítems).
 * El id de la venta es único y estable entre reintentos.
 */
export function buildInvoiceReference(saleId: string): string {
  return `FACT-${saleId}`
}

/** Construye el InvoicePayload completo. */
export async function buildInvoicePayload(input: {
  saleId: string
  tenantId?: string
  operationType?: string
  numberingRangeId?: number
}): Promise<InvoicePayload> {
  const { sale, ctx, customerRow, itemsRows, paymentsRows } = await loadInvoiceContext(
    input.saleId,
    input.numberingRangeId,
    input.tenantId
  )

  const validationErrors = validateInvoiceContext({
    sale,
    itemsRows,
    paymentsRows,
    customerRow,
    ctx,
  })
  if (validationErrors.length) {
    throw new Error(
      `No se puede emitir la factura electrónica:\n${validationErrors
        .map((error) => `- ${error}`)
        .join('\n')}`
    )
  }

  const discountPercentage = Number(sale.discountPercentage ?? 0)
  const exactInvoiceTotal = computeExactInvoiceTotal(itemsRows, discountPercentage)
  const cashRoundingAmount = computeCashRoundingAmount(
    exactInvoiceTotal,
    Number(sale.total ?? exactInvoiceTotal)
  )
  const invoiceTotal = Number((exactInvoiceTotal + cashRoundingAmount).toFixed(2))

  // Cliente identificado: se combina el registro `customer` (fuente fiscal) con
  // el snapshot de la venta (datos históricos). Sin documento → consumidor final
  // explícito, sin inventar datos de un cliente real.
  const customer = sale.customerDocNumber
    ? {
        documentType: customerRow?.documentType || sale.customerDocType || 'CC',
        documentNumber: customerRow?.documentNumber || sale.customerDocNumber || '',
        personType: customerRow?.personType || 'NATURAL',
        name: customerRow?.name || sale.customerName || '',
        tradeName: customerRow?.tradeName || null,
        email: customerRow?.email || sale.customerEmail || null,
        phone: customerRow?.phone || sale.customerPhone || null,
        address:
          customerRow?.address ||
          sale.customerAddress ||
          ctx.tenant.address ||
          null,
        tributeCode: customerRow?.tributeCode || ctx.tenant.tributeCode || DEFAULT_TRIBUTE_CODE,
        legalOrganizationCode: customerRow?.legalOrganizationCode || null,
        municipalityCode:
          customerRow?.municipalityCode || ctx.tenant.municipalityCode || DEFAULT_MUNICIPALITY_CODE,
        identificationDocumentCode: customerRow?.identificationDocumentCode || null,
      }
    : FINAL_CONSUMER

  const tenantMunicipality = ctx.tenant.municipalityCode || DEFAULT_MUNICIPALITY_CODE
  const tenantTribute = ctx.tenant.tributeCode || DEFAULT_TRIBUTE_CODE

  return {
    numbering_range_id: ctx.tenant.numberingRangeId,
    reference_code: buildInvoiceReference(sale.id),
    document: '01',
    operation_type: input.operationType ?? '10',
    send_email: Boolean(customer.email),
    observation: 'Factura emitida automáticamente desde POS Retail',
    cash_rounding_amount: cashRoundingAmount,
    payment_details: buildPayments(paymentsRows, invoiceTotal),
    customer: buildCustomerPayload(customer, tenantMunicipality, tenantTribute),
    items: buildItems(itemsRows, discountPercentage),
  } as InvoicePayload
}
