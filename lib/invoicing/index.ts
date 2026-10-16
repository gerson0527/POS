// index.ts — Factory del InvoiceProvider (Fase 4.25: la config del tenant vive en
// tenant-credentials.ts; aquí solo se resuelve la config final y se arma el provider).
//
// El proveedor tecnológico se configura UNA vez en el servidor (.env).
// Las empresas (tenants) pueden tener override de credenciales/rango en la BD.
// Esta función:
//   1. Lee la config base del .env (singleton del sistema)
//   2. Si el tenant tiene credenciales propias en la BD, las usa (override por empresa)
//   3. Si no, usa la del .env
//   4. Devuelve null si no hay ninguna config

import { InvoiceProvider, InvoiceProviderConfig } from './types'
import { FactusProvider } from './factus'
import { getEnvProviderConfig } from './env-config'
import { getTenantFactusConfig } from './tenant-credentials'

export { getTenantFactusConfig } from './tenant-credentials'

/**
 * Resuelve la config final del provider combinando .env (base) + tenant (override).
 * `opts.tenantConfig` evita una consulta extra a la BD cuando el caller ya la tiene
 * (usa `'tenantConfig' in opts` para distinguir "no traído" de "null explícito").
 */
export async function getInvoiceProvider(
  tenantId: string,
  opts?: { tenantConfig?: InvoiceProviderConfig | null }
): Promise<InvoiceProvider | null> {
  // 1) Config base del servidor (.env)
  const env = getEnvProviderConfig()
  const tenantOverride =
    opts && 'tenantConfig' in opts ? (opts.tenantConfig ?? null) : await getTenantFactusConfig(tenantId)

  if (!env.config) {
    // Sin .env configurado, intentar fallback a BD por tenant
    if (!tenantOverride) return null
    return new FactusProvider(tenantOverride)
  }

  // Combinar: base del .env + override del tenant (solo el rango de numeración)
  const finalConfig: InvoiceProviderConfig = {
    ...env.config,
    // Si el tenant tiene su propio numberingRangeId, lo usa
    numberingRangeId:
      tenantOverride?.numberingRangeId && tenantOverride.numberingRangeId > 0
        ? tenantOverride.numberingRangeId
        : env.config.numberingRangeId,
    // Si el tenant tiene su propio NIT, lo usa (cada empresa factura con su NIT)
    sellerNit: tenantOverride?.sellerNit || env.config.sellerNit,
  }

  return new FactusProvider(finalConfig)
}

/** Devuelve un resumen de la config (para mostrar en la UI). */
export async function getInvoiceProviderSummary(tenantId: string) {
  const env = getEnvProviderConfig()
  const tenantOverride = await getTenantFactusConfig(tenantId)
  const hasTenantOverride = !!tenantOverride
  return {
    envConfigured: env.configured,
    envProviderName: env.summary.providerName,
    envBaseUrl: env.summary.baseUrl,
    envEnvironment: env.summary.environment,
    envMissingFields: env.missingFields,
    tenantHasOverride: hasTenantOverride,
    tenantOverridesNumbering: !!tenantOverride?.numberingRangeId,
    activeBaseUrl: tenantOverride?.baseUrl || env.config?.baseUrl || null,
    activeEnvironment: tenantOverride?.environment || env.config?.environment || null,
  }
}
