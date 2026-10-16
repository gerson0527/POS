// lib/invoicing/env-config.ts
// Lee la configuración del PROVEEDOR TECNOLÓGICO desde variables de entorno.
// Esta configuración es ÚNICA para todo el sistema (no por empresa).
// La empresa puede tener un override solo del numberingRangeId si necesita uno diferente.

import type { InvoiceProviderConfig } from './types'

const ENV_KEYS = {
  baseUrl: 'DIAN_PROVIDER_BASE_URL',
  environment: 'DIAN_PROVIDER_ENVIRONMENT',
  clientId: 'DIAN_PROVIDER_CLIENT_ID',
  clientSecret: 'DIAN_PROVIDER_CLIENT_SECRET',
  username: 'DIAN_PROVIDER_USERNAME',
  password: 'DIAN_PROVIDER_PASSWORD',
  defaultNumberingRangeId: 'DIAN_PROVIDER_DEFAULT_NUMBERING_RANGE_ID',
} as const

export interface EnvProviderConfig {
  /** Devuelve null si el .env no tiene la config mínima. */
  config: InvoiceProviderConfig | null
  configured: boolean
  missingFields: string[]
  /** Resumen legible para mostrar en la UI */
  summary: {
    providerName: string
    baseUrl: string | null
    environment: 'sandbox' | 'production' | null
    hasCredentials: boolean
  }
}

export function getEnvProviderConfig(): EnvProviderConfig {
  const baseUrl = process.env[ENV_KEYS.baseUrl]
  const clientId = process.env[ENV_KEYS.clientId]
  const clientSecret = process.env[ENV_KEYS.clientSecret]
  const username = process.env[ENV_KEYS.username]
  const password = process.env[ENV_KEYS.password]
  const environment = (process.env[ENV_KEYS.environment] || 'sandbox') as 'sandbox' | 'production'
  const defaultNumberingRangeId = Number(process.env[ENV_KEYS.defaultNumberingRangeId] || 0)

  const missingFields: string[] = []
  if (!baseUrl) missingFields.push(ENV_KEYS.baseUrl)
  if (!clientId) missingFields.push(ENV_KEYS.clientId)
  if (!clientSecret) missingFields.push(ENV_KEYS.clientSecret)
  if (!username) missingFields.push(ENV_KEYS.username)
  if (!password) missingFields.push(ENV_KEYS.password)

  if (missingFields.length > 0 || defaultNumberingRangeId <= 0) {
    if (defaultNumberingRangeId <= 0 && !missingFields.includes(ENV_KEYS.defaultNumberingRangeId)) {
      missingFields.push(ENV_KEYS.defaultNumberingRangeId)
    }
    return {
      config: null,
      configured: false,
      missingFields,
      summary: {
        providerName: 'No configurado',
        baseUrl: baseUrl || null,
        environment,
        hasCredentials: missingFields.length === 0,
      },
    }
  }

  return {
    config: {
      providerId: 'factus-v2', // Por ahora solo soportamos Factus V2
      baseUrl: baseUrl!,
      environment,
      clientId: clientId!,
      clientSecret: clientSecret!,
      username: username!,
      password: password!,
      numberingRangeId: defaultNumberingRangeId,
      sellerNit: '', // El tenant proporciona su propio NIT
      numberingPrefix: 'FACT',
    },
    configured: true,
    missingFields: [],
    summary: {
      providerName: 'Factus V2 (configurado en servidor)',
      baseUrl: baseUrl ?? null,
      environment,
      hasCredentials: true,
    },
  }
}
