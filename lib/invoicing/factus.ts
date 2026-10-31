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
import { FACTUS_HTTP_TIMEOUT_MS, TokenCache, fetchFactus, requestFactusToken } from './factus-http'
import {
  buildFactusFailureMessage,
  extractBill,
  extractBillList,
  fetchBillLinks,
  getFactusDianStatus,
  parseFactusBody,
  toFactusPayload,
  toInvoiceResult,
} from './factus-mappers'

// El provider se crea por request; el token OAuth se comparte a nivel de módulo
// por credenciales para no hacer un password grant en cada emisión (R-06).
const tokenCaches = new Map<string, TokenCache>()

function tokenCacheKey(config: InvoiceProviderConfig): string {
  return [
    config.baseUrl,
    config.environment,
    config.clientId,
    config.username,
  ].join('|')
}

export class FactusProvider implements InvoiceProvider {
  readonly providerId = 'factus-v2'
  readonly displayName = '(Sandbox / Producción)'

  private readonly tokenCache: TokenCache

  constructor(private readonly config: InvoiceProviderConfig) {
    const key = tokenCacheKey(config)
    let cache = tokenCaches.get(key)
    if (!cache) {
      cache = new TokenCache()
      tokenCaches.set(key, cache)
    }
    this.tokenCache = cache
  }

  get numberingRangeId(): number {
    return this.config.numberingRangeId
  }

  /** POST /oauth/token — password grant (con cache; `force` tras un 401). */
  private authenticate(force = false): Promise<string> {
    return requestFactusToken(this.config, this.tokenCache, this.providerId, force)
  }

  private authHeaders(token: string): Record<string, string> {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }
  }

  /** DELETE /v2/bills/destroy/reference/{reference_code} (factura pendiente 409). */
  private async destroyBillByReference(
    token: string,
    referenceCode: string
  ): Promise<{ ok: boolean; status: number }> {
    try {
      const res = await fetchFactus(
        `${this.config.baseUrl}/v2/bills/destroy/reference/${encodeURIComponent(referenceCode)}`,
        {
          method: 'DELETE',
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        }
      )
      // 404 = ya no existe (idempotente): se puede intentar crear de nuevo.
      return { ok: res.ok || res.status === 404, status: res.status }
    } catch (err: any) {
      console.error(
        `[FactusProvider] no se pudo eliminar la factura pendiente ${referenceCode}:`,
        err?.message ?? err
      )
      return { ok: false, status: 0 }
    }
  }

  private async postValidate(
    token: string,
    payload: ReturnType<typeof toFactusPayload>
  ): Promise<Response> {
    try {
      return await fetchFactus(`${this.config.baseUrl}/v2/bills/validate`, {
        method: 'POST',
        headers: this.authHeaders(token),
        body: JSON.stringify(payload),
      })
    } catch (err: any) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
      const message = timedOut
        ? `Factus no respondió en ${FACTUS_HTTP_TIMEOUT_MS} ms al emitir la factura.`
        : `Error de red al emitir factura: ${err?.message ?? 'network'}`
      throw new InvoiceProviderError(message, {
        providerId: this.providerId,
        code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      })
    }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const token = await this.authenticate()
      return {
        ok: !!token,
        message: `Conectado a (${this.config.environment}) correctamente.`,
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
    let token = await this.authenticate()
    let res = await fetchFactus(`${this.config.baseUrl}/v2/numbering-ranges`, {
      method: 'GET',
      headers: this.authHeaders(token),
    })
    if (res.status === 401) {
      token = await this.authenticate(true)
      res = await fetchFactus(`${this.config.baseUrl}/v2/numbering-ranges`, {
        method: 'GET',
        headers: this.authHeaders(token),
      })
    }
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
    const payload = toFactusPayload(invoice)
    let token = await this.authenticate()
    let res: Response

    try {
      res = await this.postValidate(token, payload)
      if (res.status === 401) {
        // Token vencido/revocado: se re-autentica una vez y se reintenta.
        token = await this.authenticate(true)
        res = await this.postValidate(token, payload)
      }
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Error de red al emitir factura.',
        providerId: this.providerId,
        uncertain: true,
        needsReconciliation: true,
      }
    }

    let text = await res.text()

    // Factus devuelve 409 cuando ya existe una factura PENDIENTE (creada pero
    // no validada) para el mismo reference_code. La doc exige eliminarla por
    // referencia y volver a crearla; sin esto el outbox reintenta 409 por siempre.
    if (res.status === 409) {
      const destroyed = await this.destroyBillByReference(token, invoice.reference_code)
      if (destroyed.ok) {
        try {
          res = await this.postValidate(token, payload)
          text = await res.text()
        } catch (err: any) {
          return {
            success: false,
            message: err?.message || 'Error de red al recrear la factura pendiente.',
            providerId: this.providerId,
            uncertain: true,
            needsReconciliation: true,
          }
        }
      } else {
        return {
          success: false,
          message: `Factus reporta una factura pendiente para ${invoice.reference_code} y no fue posible eliminarla (HTTP ${destroyed.status}). Se reintentará con reconciliación.`,
          dianStatus: 'PENDING',
          providerId: this.providerId,
          needsReconciliation: true,
        }
      }
    }

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

      // 5xx/429 son resultados inciertos: pudo crearse la factura del lado de
      // Factus. 4xx de validación son rechazos deterministas.
      const uncertain = res.status >= 500 || res.status === 429
      return {
        success: false,
        message: buildFactusFailureMessage(res.status, json),
        dianStatus,
        providerId: this.providerId,
        rawResponse: json,
        uncertain,
        needsReconciliation: uncertain,
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

  /**
   * GET /v2/bills?filter[reference_code]=... — reconciliación por referencia.
   * Devuelve la factura si Factus ya la tiene (validada o pendiente); null si
   * no existe. Se usa antes de reenviar cuando el resultado anterior fue incierto
   * y para recuperar CUFE/links cuando falló la persistencia local.
   */
  async lookupBillByReference(referenceCode: string): Promise<InvoiceResult | null> {
    let token = await this.authenticate()
    const url = `${this.config.baseUrl}/v2/bills?filter[reference_code]=${encodeURIComponent(
      referenceCode
    )}`

    const request = async (authToken: string) =>
      fetchFactus(url, {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${authToken}` },
      })

    let res: Response
    try {
      res = await request(token)
      if (res.status === 401) {
        token = await this.authenticate(true)
        res = await request(token)
      }
    } catch (err: any) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
      throw new InvoiceProviderError(
        timedOut
          ? `La consulta de reconciliación agotó el tiempo de espera (${FACTUS_HTTP_TIMEOUT_MS} ms).`
          : `Error de red consultando ${referenceCode}: ${err?.message ?? 'network'}`,
        { providerId: this.providerId, code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR' }
      )
    }

    if (!res.ok) {
      throw new InvoiceProviderError(`Error al consultar la factura ${referenceCode} (${res.status})`, {
        providerId: this.providerId,
        status: res.status,
      })
    }

    const json = parseFactusBody(await res.text())
    const list = extractBillList(json)
    const entry =
      list.find(
        (item: any) =>
          String(item?.reference_code ?? item?.referenceCode ?? '') === referenceCode
      ) ?? list[0]
    if (!entry) return null

    const bill = entry.bill ?? entry
    const normalizedBill = {
      ...bill,
      reference_code: bill?.reference_code ?? entry?.reference_code ?? referenceCode,
    }
    const dianStatus = getFactusDianStatus(json, normalizedBill)
    const links = await fetchBillLinks(this.config.baseUrl, token, normalizedBill, {
      qrCodeUrl: normalizedBill?.qr,
      pdfUrl: normalizedBill?.public_url,
      xmlUrl: normalizedBill?.xml_url,
    })
    const result = toInvoiceResult({
      invoice: { reference_code: referenceCode } as InvoicePayload,
      json,
      bill: normalizedBill,
      dianStatus,
      links,
      providerId: this.providerId,
    })

    if (!result.cufe) {
      return {
        ...result,
        success: false,
        message: `La factura ${referenceCode} existe en Factus pero aún no está validada por la DIAN.`,
      }
    }
    return result
  }
}
