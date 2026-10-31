// Auditoría y eventos de dominio. Sin dependencias de sesión HTTP: los usan
// tanto las Server Actions como los servicios invocados desde canales externos.
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'

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
    changes: changes as any,
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
    payload: payload as any,
  })
}
