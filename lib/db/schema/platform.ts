import {
  pgTable,
  text,
  timestamp,
  integer,
  decimal,
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

// WEBHOOK: Webhooks para notificaciones
export const webhook = pgTable(
  'webhook',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    url: text('url').notNull(),
    events: text('events').notNull(), // JSON array of events
    status: text('status').notNull().default('ACTIVE'),
    secret: text('secret').notNull(),
    lastTriggeredAt: timestamp('lastTriggeredAt'),
    failureCount: integer('failureCount').notNull().default(0),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('wh_tenant_idx').on(table.tenantId),
    statusIdx: index('wh_status_idx').on(table.status),
  })
)

// SUBSCRIPTION: Planes de suscripción SaaS
export const subscription = pgTable(
  'subscription',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull().unique(),
    plan: text('plan').notNull(), // STARTER, PROFESSIONAL, ENTERPRISE
    status: text('status').notNull().default('ACTIVE'),
    monthlyPrice: decimal('monthlyPrice', { precision: 12, scale: 2 }).notNull(),
    invoicesLimit: integer('invoicesLimit'),
    usersLimit: integer('usersLimit'),
    storageGb: integer('storageGb'),
    currentInvoicesCount: integer('currentInvoicesCount').notNull().default(0),
    currentUsersCount: integer('currentUsersCount').notNull().default(0),
    currentStorageGb: decimal('currentStorageGb', { precision: 10, scale: 2 }).notNull().default('0'),
    billingCycleStart: text('billingCycleStart'),
    billingCycleEnd: text('billingCycleEnd'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    cancelledAt: timestamp('cancelledAt'),
  },
  (table) => ({
    tenantIdx: index('sub_tenant_idx').on(table.tenantId),
    statusIdx: index('sub_status_idx').on(table.status),
  })
)
