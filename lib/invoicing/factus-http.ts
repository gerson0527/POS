// factus-http.ts — Capa HTTP de autenticación de Factus V2 (Fase 4.25, §7.1).
// Extraído de factus.ts (authenticate + TokenCache + parseo de errores OAuth).

import { InvoiceProviderConfig, InvoiceProviderError } from './types'

/** Timeout por llamada HTTP a Factus (evita bloquear caja/outbox indefinidamente). */
export const FACTUS_HTTP_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.FACTUS_HTTP_TIMEOUT_MS ?? 20_000)
)

/** fetch con AbortSignal.timeout uniforme para todas las llamadas a Factus. */
export async function fetchFactus(
  url: string,
  init: RequestInit = {},
  timeoutMs = FACTUS_HTTP_TIMEOUT_MS
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
}

/** Cache de token OAuth con vencimiento (se refresca 5 min antes del real). */
export class TokenCache {
  private entry: { token: string; expiresAt: number } | null = null

  get valid(): boolean {
    return !!this.entry && this.entry.expiresAt > Date.now()
  }

  get token(): string | null {
    return this.valid ? this.entry!.token : null
  }

  store(token: string, expiresInMs: number): void {
    // expiresInMs debe venir de expires_in*1000; restamos 5 min de holgura.
    this.entry = { token, expiresAt: Date.now() + expiresInMs - 5 * 60 * 1000 }
  }

  /** Fuerza re-autenticación (p. ej. tras un 401 del recurso). */
  invalidate(): void {
    this.entry = null
  }
}

/** Parsea el body de error de /oauth/token y arma un hint accionable. */
export function parseOAuthError(errText: string): {
  errCode?: string
  errDesc?: string
  hint: string
} {
  let parsed: any = null
  try {
    parsed = JSON.parse(errText)
  } catch {
    /* no era JSON */
  }
  const errCode = parsed?.error
  const errDesc = parsed?.error_description || parsed?.message
  const hint =
    errCode === 'invalid_grant'
      ? ' (Verifica que el email y password sean correctos, y que correspondan a la cuenta que creó el client_id/client_secret)'
      : errCode
      ? ` (código OAuth: ${errCode})`
      : ''
  return { errCode, errDesc, hint }
}

/**
 * POST /oauth/token — password grant. Devuelve el token (desde el cache si es válido).
 * NUNCA loguea credenciales (client_id/secret/username/password).
 */
export async function requestFactusToken(
  config: InvoiceProviderConfig,
  cache: TokenCache,
  providerId = 'factus-v2',
  force = false
): Promise<string> {
  if (force) cache.invalidate()
  const cached = cache.token
  if (cached) return cached

  // Trim defensivo: las credenciales copiadas de un PDF/web suelen tener espacios/linebreaks
  const clientId = config.clientId.trim()
  const clientSecret = config.clientSecret.trim()
  const username = config.username.trim()
  const password = config.password.trim()

  const form = new URLSearchParams()
  form.append('grant_type', 'password')
  form.append('client_id', clientId)
  form.append('client_secret', clientSecret)
  form.append('username', username)
  form.append('password', password)

  const url = `${config.baseUrl}/oauth/token`
  console.log(`[FactusProvider] Auth → ${url} (client_id presente=${clientId.length > 0})`)

  let res: Response
  try {
    res = await fetchFactus(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
  } catch (err: any) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError'
    throw new InvoiceProviderError(
      timedOut
        ? `Autenticación agotó el tiempo de espera (${FACTUS_HTTP_TIMEOUT_MS} ms).`
        : `No se pudo conectar a ${url}: ${err?.message ?? 'network error'}`,
      { providerId, code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR' }
    )
  }

  if (!res.ok) {
    const errText = await res.text()
    const { errCode, errDesc, hint } = parseOAuthError(errText)

    console.error(
      `[FactusProvider] Auth falló contra ${url} —`,
      `status=${res.status} code=${errCode ?? 'n/a'}`
    )

    throw new InvoiceProviderError(
      `Autenticación Factus V2 falló (${res.status}): ${errDesc || errText}${hint}`,
      { providerId, status: res.status, code: 'AUTH_FAILED', raw: errText }
    )
  }

  const data: any = await res.json()
  const token = data.access_token
  if (!token) {
    throw new InvoiceProviderError('La respuesta de autenticación no contiene access_token', {
      providerId,
    })
  }

  const expiresIn = Number(data.expires_in ?? 3600) * 1000
  cache.store(token, expiresIn)
  return token
}
