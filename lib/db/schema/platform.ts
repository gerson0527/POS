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

// RATE_LIMIT_BUCKET: contadores de rate limiting persistentes (H-4).
// Sobrevive a reinicios de instancia serverless, a diferencia de un Map en memoria.
export const rateLimitBucket = pgTable(
  'rate_limit_bucket',
  {
    id: text('id').primaryKey(),
    windowStart: timestamp('window_start').notNull(),
    count: integer('count').notNull().default(1),
  }
)
