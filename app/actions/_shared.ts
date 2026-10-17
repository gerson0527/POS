// Helpers compartidos extraídos de pos-actions.ts (Fase 3: partición por dominios).
// NO forman parte de la API pública: no se re-exportan desde el barrel pos-actions.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { randomUUID } from 'node:crypto'

// Sesión/tenant: la implementación vive en lib/auth/session-context (Fase 3.19);
// se re-exportan los nombres históricos para no tocar los 17 módulos consumidores.
export { requireUser as getUserId, requireTenantId as getTenantId } from '@/lib/auth/session-context'
// Seguridad (H-2): guardia de rol para mutaciones. Lanza FORBIDDEN si el rol
// del usuario no está entre los permitidos.
export { requireRole } from '@/lib/auth/session-context'

// AUDIT & EVENTS
export async function logAudit(
  tenantId: string,
  userId: string,
  action: string,
  entity: string,
  entityId: string,
  changes: unknown
) {
  await db.insert(schema.auditLog).values({
    id: `audit_${randomUUID()}`,
    tenantId,
    userId,
    action,
    entity,
    entityId,
    changes: changes as any
  })
}

export async function publishEvent(
  tenantId: string,
  eventType: string,
  aggregateType: string,
  aggregateId: string,
  payload: unknown
) {
  await db.insert(schema.event).values({
    id: `evt_${randomUUID()}`,
    tenantId,
    eventType,
    aggregateType,
    aggregateId,
    payload: payload as any
  })
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
