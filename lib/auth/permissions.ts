// Permisos por rol del tenant.
// ACCOUNTANT (Contadora/Contador) es un rol de alcance MÍNIMO: sólo puede ver
// y trabajar el módulo de facturación. El resto de roles conserva exactamente
// el alcance que tenían antes de existir este rol.
import type { TenantRole } from './session-context'

/** Roles con alcance operativo completo sobre la operación (todo menos ACCOUNTANT). */
export const ALL_ROLES: TenantRole[] = ['ADMIN', 'MANAGER', 'CASHIER', 'VIEWER']

/** Etiquetas legibles de cada rol (UI de usuarios). */
export const ROLE_LABELS: Record<TenantRole, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Supervisor Kardex',
  CASHIER: 'Cajero / Caja POS',
  VIEWER: 'Auditor Fiscal (lectura)',
  ACCOUNTANT: 'Contadora / Contador (sólo facturación)',
}

/** Únicas rutas del dashboard accesibles para la contadora. */
export const ACCOUNTANT_ALLOWED_PATHS = ['/dashboard/invoices'] as const

/** Rutas permitidas por rol. */
export function isPathAllowedForRole(role: TenantRole, pathname: string): boolean {
  if (role === 'ACCOUNTANT') {
    return ACCOUNTANT_ALLOWED_PATHS.some(
      (allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`)
    )
  }
  // IAM: solo ADMIN (crear operadores, ver directorio de usuarios/empresas).
  if (pathname === '/dashboard/users' || pathname.startsWith('/dashboard/users/')) {
    return canManageUsers(role)
  }
  return true
}

/** Ruta de inicio tras iniciar sesión, según el rol. */
export function homePathForRole(role: TenantRole): string {
  return role === 'ACCOUNTANT' ? '/dashboard/invoices' : '/dashboard'
}

/** Quién puede corregir el IVA de una factura pendiente y transmitirla a la DIAN. */
export function canManageInvoiceTax(role: TenantRole): boolean {
  return role === 'ADMIN' || role === 'MANAGER' || role === 'ACCOUNTANT'
}

/** Solo el administrador crea/edita operadores y entra a /dashboard/users. */
export function canManageUsers(role: TenantRole): boolean {
  return role === 'ADMIN'
}

/**
 * Admin de plataforma (multi-tenant): correos en PLATFORM_ADMIN_EMAILS
 * o dominio @posdian.com (compat con el panel master).
 */
export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  const normalized = (email || '').trim().toLowerCase()
  if (!normalized) return false
  const fromEnv = (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (fromEnv.includes(normalized)) return true
  return normalized === 'admin@posdian.com' || normalized.endsWith('@posdian.com')
}

/** Tarifas de IVA admitidas en el ajuste fiscal. */
export const ALLOWED_IVA_RATES = [0, 5, 8, 19] as const

export function isAllowedIvaRate(rate: number): boolean {
  return (ALLOWED_IVA_RATES as readonly number[]).includes(Number(rate))
}
