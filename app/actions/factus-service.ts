'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
//
// Fase 4.25 (§5.2): la lógica de dominio de emisión vive en
// lib/invoicing/emit-invoice.ts; este action solo delega y preserva el
// contrato de retorno ({success, message}).
import { getTenantId, getUserId, requireRole } from './_shared'
import type { TenantRole } from '@/lib/auth/session-context'

export async function emitFactusElectronicInvoice(saleId: string) {
  try {
    const userId = await getUserId()
    await requireRole(userId, ['ADMIN', 'MANAGER', 'CASHIER'])
    const tenantId = await getTenantId(userId)
    const { emitSaleElectronicInvoice } = await import('@/lib/invoicing/emit-invoice')
    return await emitSaleElectronicInvoice(saleId, tenantId)
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Error en la transmisión a la DIAN.',
    }
  }
}

/** Helpers expuestos a la UI de configuración (configuración de credenciales, prueba, listado de rangos) */
// Todos operan sobre el tenant del usuario autenticado para evitar pasar IDs del cliente.

async function getCurrentTenantIdSafe(roles: TenantRole[] = ['ADMIN', 'MANAGER']): Promise<string> {
  const userId = await getUserId()
  await requireRole(userId, roles)
  return await getTenantId(userId)
}

export async function getFactusConfigForCurrentTenant() {
  const tenantId = await getCurrentTenantIdSafe()
  const { getTenantFactusConfig } = await import('@/lib/invoicing')
  const cfg = await getTenantFactusConfig(tenantId)
  if (!cfg) {
    return {
      factusClientId: '',
      factusClientSecret: '',
      factusUsername: '',
      factusPassword: '',
      factusEnvironment: 'sandbox' as 'sandbox' | 'production',
      factusNumberingRangeId: 0,
      hasClientSecret: false,
      hasPassword: false,
    }
  }
  // Por seguridad NUNCA devolvemos los secretos (client_secret / password) al cliente.
  // Solo indicamos si ya están configurados para que la UI muestre un placeholder.
  // El backend trata '' como "no cambiar" al guardar, preservando lo almacenado.
  return {
    factusClientId: cfg.clientId,
    factusClientSecret: '',
    factusUsername: cfg.username,
    factusPassword: '',
    factusEnvironment: cfg.environment,
    factusNumberingRangeId: cfg.numberingRangeId,
    hasClientSecret: true,
    hasPassword: true,
  }
}

export async function testFactusConnection(): Promise<{ ok: boolean; message: string }> {
  const tenantId = await getCurrentTenantIdSafe()
  const { getInvoiceProvider } = await import('@/lib/invoicing')
  const provider = await getInvoiceProvider(tenantId)
  if (!provider) {
    return { ok: false, message: 'Primero completa las credenciales de facturación electrónica en este tenant.' }
  }
  return provider.testConnection()
}

export async function fetchFactusNumberingRanges(): Promise<
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
  const tenantId = await getCurrentTenantIdSafe()
  const { getInvoiceProvider } = await import('@/lib/invoicing')
  const provider = await getInvoiceProvider(tenantId)
  if (!provider) return []
  return provider.listNumberingRanges()
}

export async function getInvoiceProviderStatus(): Promise<{
  configured: boolean
  providerId: string | null
  environment: string | null
  baseUrl: string | null
  source: 'env' | 'tenant-override' | 'none'
  tenantOverridesNumbering: boolean
}> {
  const tenantId = await getCurrentTenantIdSafe()
  const { getInvoiceProviderSummary } = await import('@/lib/invoicing')
  const summary = await getInvoiceProviderSummary(tenantId)
  return {
    configured: summary.envConfigured || summary.tenantHasOverride,
    providerId: summary.envConfigured || summary.tenantHasOverride ? 'factus-v2' : null,
    environment: summary.activeEnvironment,
    baseUrl: summary.activeBaseUrl,
    source: summary.tenantHasOverride ? 'tenant-override' : summary.envConfigured ? 'env' : 'none',
    tenantOverridesNumbering: summary.tenantOverridesNumbering,
  }
}

