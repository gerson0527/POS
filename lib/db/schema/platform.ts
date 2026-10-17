import {
  pgTable,
  text,
  timestamp,
  integer,
  index } from 'drizzle-orm/pg-core'

// API_KEY: Claves para acceso a API pública
export const apiKey = pgTable(
  'api_key',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    name: text('name').notNull(),
    keyHash: text('keyHash').notNull().unique(),
    keyPrefix: text('keyPrefix').notNull(),
    rateLimit: integer('rateLimit').notNull().default(1000),
    rateLimitWindow: text('rateLimitWindow').notNull().default('1h'),
    scopes: text('scopes').notNull().default('read'),
    status: text('status').notNull().default('ACTIVE'),
    lastUsedAt: timestamp('lastUsedAt'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    expiresAt: timestamp('expiresAt'),
  },
  (table) => ({
    tenantIdx: index('ak_tenant_idx').on(table.tenantId),
    statusIdx: index('ak_status_idx').on(table.status),
  })
)
