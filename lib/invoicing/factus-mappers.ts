// factus-mappers.ts — Mapeos puros POS ↔ Factus/DIAN (Fase 4.25, §7.1).
// Extraído de factus.ts: funciones nominales y testeables, sin estado de clase.
// build-bill.ts importa de aquí (rompe la dependencia invertida sobre FactusProvider).

import {
  InvoicePayload,
  InvoicePaymentDetailPayload,
  InvoiceResult,
} from './types'
import { FACTUS_HTTP_TIMEOUT_MS } from './factus-http'
import { factusPaymentCode } from '@/lib/catalogs/payment-methods'

// Mapeo de tipos de documento POS a códigos DIAN
const POS_TO_FACTUS_DOCUMENT_TYPE: Record<string, string> = {
  CC: '13',
  TI: '12',
  CE: '22',
  PAS: '41',
  PASAPORTE: '41',
  NIT: '31',
  RC: '11',
}

/** Respuesta cruda de /v2/bills/validate. */
export interface FactusRawResponse {
  status?: string
  message?: string
  data?: {
    bill?: {
      id?: number
      number?: string
      cufe?: string
      qr?: string
      public_url?: string
      xml_url?: string
      status?: string
      is_validated?: boolean
      validated_at?: string | null
      errors?: Record<string, string> | unknown[]
    }
  }
}

/** Mapea método de pago POS → código DIAN/Factus. */
export function mapPaymentMethod(posMethod: string): string {
  return factusPaymentCode(posMethod)
}

/** Mapea tipo de documento POS → código DIAN. */
export function mapDocumentType(posDocType: string): string {
  if (!posDocType) return '13'
  return POS_TO_FACTUS_DOCUMENT_TYPE[posDocType.toUpperCase()] || '13'
}

/**
 * Mapea ivaRate + tratamiento tributario → (code, rate, excluded).
 * `EXEMPT` (exento) mantiene base gravable y NO se marca excluido; `EXCLUDED`
 * (excluido/no causa) sí se marca. El valor por defecto conserva el
 * comportamiento histórico para tasas 0 (excluido).
 */
export function mapTax(
  rate: number | string,
  treatment: string = 'TAXED'
): { code: string; rate: string; is_excluded: boolean } {
  const r = Number(rate)
  const normalized = String(treatment || 'TAXED').trim().toUpperCase()
  if (!Number.isFinite(r) || r <= 0) {
    return {
      code: '01',
      rate: '0.00',
      is_excluded: normalized !== 'EXEMPT',
    }
  }
  return { code: '01', rate: r.toFixed(2), is_excluded: false }
}

/**
 * Separa prefijo y consecutivo del número fiscal asignado por Factus
 * (p. ej. `SETP990012345` → prefijo SETP, consecutivo 990012345).
 * El consecutivo fiscal NUNCA debe tomarse del ticket interno del POS.
 */
export function parseFiscalBillNumber(
  billNumber: string | number | null | undefined
): { prefix?: string; consecutive?: string } {
  const raw = String(billNumber ?? '').trim()
  if (!raw) return {}
  const match = raw.match(/^([A-Za-z]*)[-\s]?0*(\d+)$/)
  if (!match) return {}
  const prefix = match[1] ? match[1].toUpperCase() : undefined
  return { prefix, consecutive: match[2] }
}

/** Normaliza cualquier número a string con 2 decimales (estándar DIAN). */
export function toMoneyString(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0.00'
  return n.toFixed(2)
}

/** Convierte un valor del método de pago POS → InvoicePaymentDetailPayload.
 *  El crédito de cuenta corriente se informa a DIAN como efectivo (payment_form '1'). */
export function toPaymentDetail(
  posMethod: string,
  amount: number,
  referenceCode?: string
): InvoicePaymentDetailPayload {
  const isStoreCredit = posMethod.toUpperCase().trim() === 'STORE_CREDIT'
  return {
    payment_form: isStoreCredit ? '2' : '1',
    payment_method_code: mapPaymentMethod(posMethod),
    reference_code: referenceCode,
    amount: toMoneyString(amount),
    due_date: isStoreCredit
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : undefined,
  }
}

/** Construye el payload final para /v2/bills/validate a partir del InvoicePayload genérico. */
export function toFactusPayload(invoice: InvoicePayload) {
  return {
    numbering_range_id: invoice.numbering_range_id,
    reference_code: invoice.reference_code,
    document: invoice.document,
    operation_type: invoice.operation_type,
    send_email: invoice.send_email ?? false,
    observation: invoice.observation ?? '',
    cash_rounding_amount: toMoneyString(invoice.cash_rounding_amount ?? 0),
    payment_details: invoice.payment_details.map((p) => ({
      payment_form: String(p.payment_form),
      payment_method_code: String(p.payment_method_code),
      reference_code: p.reference_code,
      amount: toMoneyString(p.amount),
      due_date: p.due_date,
    })),
    customer: {
      ...invoice.customer,
      identification_document_code: String(invoice.customer.identification_document_code),
      identification: String(invoice.customer.identification),
      municipality_code: String(invoice.customer.municipality_code),
      legal_organization_code: String(invoice.customer.legal_organization_code),
      tribute_code: String(invoice.customer.tribute_code),
      dv: invoice.customer.dv ? String(invoice.customer.dv) : undefined,
      phone: invoice.customer.phone ? String(invoice.customer.phone) : undefined,
    },
    items: invoice.items.map((it) => ({
      code_reference: String(it.code_reference),
      name: String(it.name),
      quantity: toMoneyString(it.quantity),
      price: toMoneyString(it.price),
      discount_rate: it.discount_rate !== undefined ? toMoneyString(it.discount_rate) : '0.00',
      unit_measure_code: String(it.unit_measure_code ?? '94'),
      standard_code: String(it.standard_code ?? '999'),
      scheme_id: it.scheme_id !== undefined ? String(it.scheme_id) : undefined,
      taxes: (it.taxes || []).map((t) => ({
        code: String(t.code),
        rate: toMoneyString(t.rate),
        is_excluded: t.is_excluded,
      })),
    })),
  }
}

/** Parsea el body de respuesta (JSON o crudo) sin lanzar. */
export function parseFactusBody(text: string): FactusRawResponse {
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    // no JSON; keep as raw
    return {}
  }
}

/** Extrae el bill de la respuesta (algunos errores traen `data` directo). */
export function extractBill(json: FactusRawResponse): any {
  return (json as any)?.data?.bill ?? (json as any)?.data
}

/** Normaliza la lista paginada de /v2/bills a un array de facturas. */
export function extractBillList(json: unknown): any[] {
  const data = (json as any)?.data
  const list = data?.data ?? data
  return Array.isArray(list) ? list : []
}

// `/v2/bills/validate` responde `status: "Created"` / `"OK"` a nivel raíz: es el
// estado HTTP de Factus, NO el estado DIAN. El estado real está en `data.is_validated`
// (y en `data.errors` para rechazos). Usar el status raíz como estado DIAN marcaba
// facturas válidas como TECHNICAL_FAILURE.
const GENERIC_PROVIDER_STATUSES = new Set([
  'OK',
  'CREATED',
  'SUCCESS',
  'SOLICITUD EXITOSA',
])
const EXPLICIT_DIAN_STATUS = /ACCEPT|ACEPT|APROB|VALID|REJECT|RECHAZ|ERROR|FAIL|FALLA|PEND|QUEUE|COLA/i

function hasRejectionError(errors: unknown): boolean {
  if (!errors) return false
  const values = Array.isArray(errors) ? errors : Object.values(errors)
  return values.some((value) => {
    const message =
      typeof value === 'object' && value !== null
        ? (value as any).message ?? JSON.stringify(value)
        : String(value)
    return /rechaz/i.test(message)
  })
}

/**
 * Estado DIAN devuelto por Factus. `data.is_validated` es la fuente autoritativa
 * (ver docs Factus V2: "verificar is_validated"); `bill.status` solo se usa si es
 * un estado DIAN explícito. Un status raíz genérico ("OK"/"Created") se ignora.
 */
export function getFactusDianStatus(json: FactusRawResponse, bill: any): string | undefined {
  const billStatus = typeof bill?.status === 'string' ? bill.status.trim() : ''
  if (billStatus && !GENERIC_PROVIDER_STATUSES.has(billStatus.toUpperCase())) {
    return billStatus
  }

  if (bill?.is_validated === true) return 'ACCEPTED'

  if (bill?.is_validated === false) {
    const errors = bill?.errors ?? (json as any)?.errors
    return hasRejectionError(errors) ? 'REJECTED' : 'SUBMITTED'
  }

  const rootStatus = typeof (json as any)?.status === 'string' ? (json as any).status.trim() : ''
  if (rootStatus && EXPLICIT_DIAN_STATUS.test(rootStatus)) return rootStatus

  return undefined
}

/**
 * Arma el mensaje de fallo de /v2/bills/validate.
 * Factus V2 a veces devuelve `errors` como objeto {campo: [msgs]} en vez de array.
 */
export function buildFactusFailureMessage(status: number, json: FactusRawResponse): string {
  let detail = ''
  const errs = (json as any)?.errors
  if (errs && typeof errs === 'object' && !Array.isArray(errs)) {
    detail = Object.entries(errs)
      .map(([field, msgs]) => {
        const msg = Array.isArray(msgs) ? msgs.join(', ') : String(msgs)
        return `  • ${field}: ${msg}`
      })
      .join('\n')
  } else if (Array.isArray(errs)) {
    detail = errs
      .map((e: any) => `  • ${e?.message ?? JSON.stringify(e)}`)
      .join('\n')
  }

  const baseMsg = (json as any)?.message || `Factus V2 respondió con status ${status}`
  return detail ? `${baseMsg}\n\n${detail}` : baseMsg
}

/**
 * La respuesta de /v2/bills/validate trae el CUFE pero NO siempre trae los
 * links (QR/PDF/XML): están en el detalle GET /v2/bills/{number}.
 */
export async function fetchBillLinks(
  baseUrl: string,
  token: string,
  bill: any,
  current: { qrCodeUrl?: string; pdfUrl?: string; xmlUrl?: string }
): Promise<{ qrCodeUrl?: string; pdfUrl?: string; xmlUrl?: string }> {
  let { qrCodeUrl, pdfUrl, xmlUrl } = current
  if (bill?.number && (!qrCodeUrl || !pdfUrl)) {
    try {
      const detRes = await fetch(`${baseUrl}/v2/bills/${bill.number}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(FACTUS_HTTP_TIMEOUT_MS),
      })
      if (detRes.ok) {
        const detJson: any = await detRes.json().catch(() => null)
        const detail = detJson?.data?.bill ?? detJson?.data ?? detJson
        const links = detail?.links ?? {}
        qrCodeUrl = links.qr ?? qrCodeUrl
        pdfUrl = links.public_url ?? pdfUrl
        xmlUrl = links.xml ?? detail?.xml_url ?? xmlUrl
      } else {
        console.warn(`[FactusProvider] detalle de ${bill.number} no disponible (${detRes.status})`)
      }
    } catch (err: any) {
      console.warn('[FactusProvider] no se pudo obtener el detalle (QR/PDF):', err?.message ?? err)
    }
  }
  return { qrCodeUrl, pdfUrl, xmlUrl }
}

/** Construye el InvoiceResult de éxito a partir de la respuesta validada. */
export function toInvoiceResult(params: {
  invoice: InvoicePayload
  json: FactusRawResponse
  bill: any
  dianStatus?: string
  links: { qrCodeUrl?: string; pdfUrl?: string; xmlUrl?: string }
  providerId: string
}): InvoiceResult {
  const { invoice, json, bill, dianStatus, links, providerId } = params
  const status = dianStatus ?? 'SUBMITTED'
  return {
    success: true,
    cufe: bill?.cufe,
    qrCodeUrl: links.qrCodeUrl,
    pdfUrl: links.pdfUrl,
    xmlUrl: links.xmlUrl,
    dianStatus: status,
    billNumber: bill?.number ?? invoice.reference_code,
    message:
      (json as any)?.message ??
      (status === 'ACCEPTED'
        ? `Factura ${invoice.reference_code} emitida y aceptada por DIAN vía Factus V2.`
        : `Factura ${invoice.reference_code} emitida vía Factus V2; estado DIAN: ${status}.`),
    providerId,
    rawResponse: json,
  }
}
