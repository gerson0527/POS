// Factus V2 — Implementación de InvoiceProvider (orquestador).
// Documentación: https://developers.factus.com.co/
//
// Fase 4.25: la capa HTTP de autenticación vive en factus-http.ts
// (TokenCache, requestFactusToken, parseOAuthError) y los mapeos puros en
// factus-mappers.ts (toFactusPayload, toInvoiceResult, fetchBillLinks...).
// Esta clase solo orquesta: auth → payload → POST /v2/bills/validate → links.
// NO contiene credenciales hardcodeadas — toda la configuración viene
// de InvoiceProviderConfig (que a su vez viene de la tabla `tenant`).

import {
  InvoicePayload,
  InvoiceProvider,
  InvoiceProviderConfig,
  InvoiceProviderError,
  InvoiceResult,
} from './types'
import { TokenCache, requestFactusToken } from './factus-http'
import {
  buildFactusFailureMessage,
  extractBill,
  fetchBillLinks,
  getFactusDianStatus,
  parseFactusBody,
  toFactusPayload,
  toInvoiceResult,
} from './factus-mappers'

export class FactusProvider implements InvoiceProvider {
  readonly providerId = 'factus-v2'
  readonly displayName = 'Factus V2 (Sandbox / Producción)'

  private readonly tokenCache = new TokenCache()

  constructor(private readonly config: InvoiceProviderConfig) {}

  get numberingRangeId(): number {
    return this.config.numberingRangeId
  }

  /** POST /oauth/token — password grant (con cache). */
  private authenticate(): Promise<string> {
    return requestFactusToken(this.config, this.tokenCache, this.providerId)
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const token = await this.authenticate()
      return {
        ok: !!token,
        message: `Conectado a Factus V2 (${this.config.environment}) correctamente.`,
      }
    } catch (err: any) {
      return {
        ok: false,
        message: err?.message ?? 'Error desconocido al validar credenciales.',
      }
    }
  }

  async listNumberingRanges(): Promise<
    Array<{
      id: number
      prefix: string
      from: number
      to: number
      current: number
      status: string
      document?: string
    }>
  > {
    const token = await this.authenticate()
    const res = await fetch(`${this.config.baseUrl}/v2/numbering-ranges`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      throw new InvoiceProviderError(`Error al listar rangos (${res.status})`, {
        providerId: this.providerId,
        status: res.status,
      })
    }
    const data: any = await res.json()
    // Factus V2 responde { status, message, data: { data: [...], pagination } }.
    // `current` es el SIGUIENTE número del rango (último asignado = current - 1).
    const list = data?.data?.data ?? data?.data ?? data
    if (!Array.isArray(list)) return []
    return list.map((r: any) => ({
      id: Number(r.id),
      prefix: String(r.prefix ?? '').trim(),
      from: Number(r.from ?? 0),
      to: Number(r.to ?? 0),
      current: Number(r.current ?? 0),
      status: r.is_active === false || r.is_active === 0 ? 'INACTIVO' : 'ACTIVO',
      document: typeof r.document === 'string' ? r.document.trim() : undefined,
    }))
  }

  async sendInvoice(invoice: InvoicePayload): Promise<InvoiceResult> {
    const token = await this.authenticate()
    const payload = toFactusPayload(invoice)

    let res: Response
    try {
      res = await fetch(`${this.config.baseUrl}/v2/bills/validate`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
    } catch (err: any) {
      return {
        success: false,
        message: `Error de red al emitir factura: ${err?.message ?? 'network'}`,
        providerId: this.providerId,
      }
    }

    const text = await res.text()
    const json = parseFactusBody(text)
    const bill = extractBill(json)
    const dianStatus = getFactusDianStatus(json, bill)
    const rejected = /REJECT|RECHAZ|ERROR|FAIL/i.test(dianStatus || '')
    // Una respuesta HTTP 200 sin CUFE no es una factura aceptada. El id interno
    // de Factus no reemplaza al CUFE exigido por DIAN. Si `is_validated` es false
    // la DIAN aún no confirmó: se trata como fallo para que el outbox reintente
    // con el mismo reference_code (Factus lo documenta como reintento idempotente).
    const ok =
      res.ok && Boolean(bill?.cufe) && !rejected && bill?.is_validated !== false

    if (!ok) {
      // Logueamos solo un recorte del body (puede contener datos del cliente)
      console.error(
        `[FactusProvider] sendInvoice falló — status=${res.status} body=`,
        typeof text === 'string' ? text.substring(0, 500) : text
      )

      return {
        success: false,
        message: buildFactusFailureMessage(res.status, json),
        dianStatus,
        providerId: this.providerId,
        rawResponse: json,
      }
    }

    const links = await fetchBillLinks(this.config.baseUrl, token, bill, {
      qrCodeUrl: bill?.qr,
      pdfUrl: bill?.public_url,
      xmlUrl: bill?.xml_url,
    })

    return toInvoiceResult({
      invoice,
      json,
      bill,
      dianStatus,
      links,
      providerId: this.providerId,
    })
  }
}
