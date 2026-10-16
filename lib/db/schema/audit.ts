import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index } from 'drizzle-orm/pg-core'

// AUDIT_LOG: Auditoría de cambios
export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    userId: text('userId'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entityId').notNull(),
    changes: jsonb('changes'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('audit_log_tenant_idx').on(table.tenantId),
    actionIdx: index('audit_log_action_idx').on(table.action),
    entityIdx: index('audit_log_entity_idx').on(table.entity),
  })
)

// EVENT: Event sourcing para eventos críticos
export const event = pgTable(
  'event',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    eventType: text('eventType').notNull(),
    aggregateId: text('aggregateId').notNull(),
    aggregateType: text('aggregateType').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('event_tenant_idx').on(table.tenantId),
    typeIdx: index('event_type_idx').on(table.eventType),
    aggregateIdx: index('event_aggregate_idx').on(table.aggregateType, table.aggregateId),
  })
)
