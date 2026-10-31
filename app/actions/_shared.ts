// Helpers compartidos extraídos de pos-actions.ts (Fase 3: partición por dominios).
// NO forman parte de la API pública: no se re-exportan desde el barrel pos-actions.
import type { ActorContext } from '@/lib/auth/actor'
import type { TenantRole } from '@/lib/auth/session-context'
import { requireUser, requireRole as requireRoleInternal } from '@/lib/auth/session-context'

// Sesión/tenant: la implementación vive en lib/auth/session-context (Fase 3.19);
// se re-exportan los nombres históricos para no tocar los 17 módulos consumidores.
export { requireUser as getUserId, requireTenantId as getTenantId } from '@/lib/auth/session-context'
// Seguridad (H-2): guardia de rol para mutaciones. Lanza FORBIDDEN si el rol
// del usuario no está entre los permitidos.
export { requireRole } from '@/lib/auth/session-context'

// Auditoría/eventos y fechas de negocio viven en lib/ (sin dependencia de sesión
// HTTP) para que los servicios de dominio los usen desde cualquier canal.
export { logAudit, publishEvent } from '@/lib/audit/log'
export {
  getBogotaBusinessDate,
  toBusinessDateString,
  businessDateDaysBetween,
} from '@/lib/utils/business-date'

/** Construye el contexto del actor desde la sesión web y valida el rol. */
export async function requireActor(allowed: TenantRole[]): Promise<ActorContext> {
  const userId = await requireUser()
  const membership = await requireRoleInternal(userId, allowed)
  return { userId, tenantId: membership.tenantId, role: membership.role }
}

/**
 * Formatea fecha/hora en la zona de Colombia (America/Bogota) en el SERVIDOR.
 * Al serializar Date al cliente se perdía la hora local y los comprobantes
 * salían con -5 horas; por eso se formatea aquí y se envía string listo.
 */
export function formatBogotaDateTime(d: Date | string | null | undefined): string | null {
  if (!d) return null
  try {
    return new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(d))
  } catch {
    return null
  }
}

/**
 * Estados DIAN/fiscales centralizados en lib/catalogs/dian-status.ts (Fase 4.25).
 * Re-export para no romper a los consumidores históricos de este módulo.
 */
export { FISCAL_DOCUMENT_STATUSES, mapFiscalStatus } from '@/lib/catalogs/dian-status'
