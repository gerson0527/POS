import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex } from 'drizzle-orm/pg-core'

// FISCAL_OUTBOX: cola durable de emisión fiscal.
// La venta se confirma en la misma transacción que encola el evento; si DIAN o
// Factus falla después, el evento queda pendiente y un worker lo reintenta con
// el mismo reference_code (idempotencia del proveedor).
export const fiscalOutbox = pgTable(
  'fiscal_outbox',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    saleId: text('saleId').notNull(),
    eventType: text('eventType').notNull().default('EMIT_INVOICE'),
    status: text('status').notNull().default('PENDING'), // PENDING, PROCESSING, DONE, FAILED
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('maxAttempts').notNull().default(10),
    nextAttemptAt: timestamp('nextAttemptAt').notNull().defaultNow(),
    lockedAt: timestamp('lockedAt'),
    lastError: text('lastError'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    saleEventUnique: uniqueIndex('fiscal_outbox_sale_event_unique').on(
      table.tenantId,
      table.saleId,
      table.eventType
    ),
    pendingIdx: index('fiscal_outbox_pending_idx').on(table.status, table.nextAttemptAt),
    tenantIdx: index('fiscal_outbox_tenant_idx').on(table.tenantId),
  })
)
