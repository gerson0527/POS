// factus-http.ts — Capa HTTP de autenticación de Factus V2 (Fase 4.25, §7.1).
// Extraído de factus.ts (authenticate + TokenCache + parseo de errores OAuth).

import { InvoiceProviderConfig, InvoiceProviderError } from './types'

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
  providerId = 'factus-v2'
): Promise<string> {
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
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
  } catch (err: any) {
    throw new InvoiceProviderError(
      `No se pudo conectar a ${url}: ${err?.message ?? 'network error'}`,
      { providerId, code: 'NETWORK_ERROR' }
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
