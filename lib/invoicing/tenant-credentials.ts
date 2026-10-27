// tenant-credentials.ts — Fuente única de credenciales Factus del tenant (Fase 4.25, §7.1).
//
// Antes la lectura/placeholder-check vivía en lib/invoicing/index.ts y el cifrado/
// redacción del update en app/actions/factus-config.ts. Un solo lugar para:
//   - cifrar al guardar (encryptSecret, idempotente)
//   - descifrar al leer (decryptSecret, tolerante a texto plano heredado)
//   - detectar credenciales placeholder (tratar como "no configuradas")
//   - redactar valores sensibles en logs/auditoría

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { decryptSecret, encryptSecret } from '@/lib/security/encrypt'
import { InvoiceProviderConfig } from './types'

export const FACTUS_SANDBOX_URL = 'https://api-sandbox.factus.com.co'
export const FACTUS_PRODUCTION_URL = 'https://api.factus.com.co'

// Marcadores de credenciales de ejemplo/placeholder que NUNCA válidas contra Factus.
// Si las detectamos, tratamos la config como "no configurada" en vez de lanzar
// un 401 invalid_client confuso en cada venta.
const PLACEHOLDER_PATTERNS = [
  /^REAL_/i,
  /^PLACEHOLDER/i,
  /^TU_/i,
  /^CAMBIA/i,
  /^CHANGE[_-]?ME/i,
  /^XXX+/i,
  /^TUNUEVA/i,
]
const PLACEHOLDER_EMAILS = ['sandbox@factus.com.co', 'test@test.com', 'admin@admin.com']

export function isPlaceholderCredential(...values: string[]): boolean {
  return values.some((v) => {
    const s = (v ?? '').trim()
    if (!s) return false
    if (PLACEHOLDER_EMAILS.includes(s.toLowerCase())) return true
    return PLACEHOLDER_PATTERNS.some((p) => p.test(s))
  })
}

/** Lee la configuración de Factus desde el tenant (NO emite nada, solo lee BD). */
export async function getTenantFactusConfig(tenantId: string): Promise<InvoiceProviderConfig | null> {
  const rows = await db
    .select()
    .from(schema.tenant)
    .where(eq(schema.tenant.id, tenantId))
    .limit(1)

  const tenant: any = rows[0]
  if (!tenant) return null

  // Las credenciales se almacenan cifradas (AES-256-GCM, formato `v1:...`).
  // decryptSecret es tolerante: si el valor no tiene ese formato, lo devuelve tal cual
  // (texto plano heredado), permitiendo una migración perezosa.
  const clientId = decryptSecret(tenant.factusClientId) ?? ''
  const clientSecret = decryptSecret(tenant.factusClientSecret) ?? ''
  const username = decryptSecret(tenant.factusUsername) ?? ''
  const password = decryptSecret(tenant.factusPassword) ?? ''
  const environment: 'sandbox' | 'production' = tenant.factusEnvironment === 'production' ? 'production' : 'sandbox'
  const numberingRangeId = Number(tenant.factusNumberingRangeId ?? 0)
  const numberingPrefix = 'FACT'

  // Si no hay credenciales, no devolvemos provider (modo disabled)
  if (!clientId || !clientSecret || !username || !password) {
    return null
  }

  // Credenciales de ejemplo/placeholder → tratamos como no configuradas.
  // Evita el 401 invalid_client confuso de Factus en cada venta.
  if (isPlaceholderCredential(clientId, clientSecret, username, password)) {
    console.warn(
      `[invoicing] Tenant ${tenantId} tiene credenciales Factus de ejemplo/placeholder. ` +
        `Se omite la transmisión a DIAN hasta configurar credenciales reales en /dashboard/settings.`
    )
    return null
  }

  return {
    providerId: 'factus-v2',
    baseUrl: environment === 'production' ? FACTUS_PRODUCTION_URL : FACTUS_SANDBOX_URL,
    environment,
    clientId,
    clientSecret,
    username,
    password,
    numberingRangeId: numberingRangeId > 0 ? numberingRangeId : 0,
    sellerNit: tenant.nit ?? '',
    numberingPrefix,
  }
}

export interface FactusConfigInput {
  factusClientId?: string
  factusClientSecret?: string
  factusUsername?: string
  factusPassword?: string
  factusEnvironment?: 'sandbox' | 'production'
  factusNumberingRangeId?: number
  fiscalMunicipalityCode?: string
  fiscalTributeCode?: string
}

/**
 * Construye el set de columnas a actualizar para la config Factus del tenant,
 * cifrando los campos sensibles. encryptSecret es idempotente (no re-cifra si el
 * valor ya tiene formato `v1:...`), así que un round-trip desde el frontend que
 * reenvíe un valor ya cifrado no lo corrompe.
 *
 * Para los secretos (clientSecret / password) una cadena vacía significa
 * "no cambiar" (el frontend nunca recibe el valor almacenado por seguridad).
 */
export function buildFactusConfigUpdate(input: FactusConfigInput): Record<string, unknown> {
  const update: Record<string, unknown> = {}
  if (input.factusClientId !== undefined) update.factusClientId = encryptSecret(input.factusClientId)
  if (input.factusClientSecret) update.factusClientSecret = encryptSecret(input.factusClientSecret)
  if (input.factusUsername !== undefined) update.factusUsername = encryptSecret(input.factusUsername)
  if (input.factusPassword) update.factusPassword = encryptSecret(input.factusPassword)
  if (input.factusEnvironment !== undefined) update.factusEnvironment = input.factusEnvironment
  if (input.factusNumberingRangeId !== undefined)
    update.factusNumberingRangeId = input.factusNumberingRangeId
  if (input.fiscalMunicipalityCode !== undefined) {
    update.fiscalMunicipalityCode = input.fiscalMunicipalityCode || '11001'
  }
  if (input.fiscalTributeCode !== undefined) {
    update.fiscalTributeCode = input.fiscalTributeCode || 'ZZ'
  }
  return update
}

/** Describe QUÉ campos se actualizaron (para console.log), sin valores. */
export function describeFactusUpdate(update: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.keys(update).map((k) => [k, k.toLowerCase().includes('factus') && update[k] ? '***' : 'set'])
  )
}

/** Payload de auditoría: valores de credenciales siempre a '***', nunca texto plano. */
export function buildFactusAuditPayload(update: Record<string, unknown>): Record<string, unknown> {
  return {
    ...update,
    factusClientId: update.factusClientId ? '***' : undefined,
    factusClientSecret: update.factusClientSecret ? '***' : undefined,
    factusUsername: update.factusUsername ? '***' : undefined,
    factusPassword: update.factusPassword ? '***' : undefined,
  }
}
