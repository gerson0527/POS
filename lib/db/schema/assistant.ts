import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/** Vínculo usuario del sistema ↔ identidad en un canal (Telegram/WhatsApp). */
export const channelLink = pgTable(
  'channel_link',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    userId: text('userId').notNull(),
    channel: text('channel').notNull(), // telegram | whatsapp
    externalUserId: text('externalUserId'),
    status: text('status').notNull().default('PENDING'), // PENDING | ACTIVE | REVOKED
    linkCode: text('linkCode'),
    linkedAt: timestamp('linkedAt'),
    expiresAt: timestamp('expiresAt'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('channel_link_tenant_idx').on(table.tenantId),
    userIdx: index('channel_link_user_idx').on(table.tenantId, table.userId),
    codeIdx: uniqueIndex('channel_link_code_idx')
      .on(table.linkCode)
      .where(sql`"linkCode" IS NOT NULL`),
    externalIdx: uniqueIndex('channel_link_external_idx')
      .on(table.channel, table.externalUserId)
      .where(sql`"externalUserId" IS NOT NULL`),
  })
)

/** Inbox auditable de mensajes entrantes (idempotencia por update_id del canal). */
export const channelMessage = pgTable(
  'channel_message',
  {
    id: text('id').primaryKey(),
    channel: text('channel').notNull(),
    externalUpdateId: text('externalUpdateId').notNull(),
    externalUserId: text('externalUserId').notNull(),
    tenantId: text('tenantId'),
    userId: text('userId'),
    type: text('type').notNull(), // text | voice | callback | command
    rawText: text('rawText'),
    transcript: text('transcript'),
    mediaRef: text('mediaRef'),
    callbackData: text('callbackData'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    updateIdx: uniqueIndex('channel_message_update_idx').on(
      table.channel,
      table.externalUpdateId
    ),
    tenantIdx: index('channel_message_tenant_idx').on(table.tenantId),
  })
)

/** Borrador de intención pendiente de confirmación (TTL ~10 min). */
export const assistantDraft = pgTable(
  'assistant_draft',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    userId: text('userId').notNull(),
    channelLinkId: text('channelLinkId').notNull(),
    channelMessageId: text('channelMessageId'),
    intent: text('intent').notNull(),
    extractedJson: jsonb('extractedJson').notNull(),
    resolvedJson: jsonb('resolvedJson'),
    summary: text('summary').notNull(),
    status: text('status').notNull().default('PENDING'),
    // PENDING | EXECUTING | DONE | CANCELLED | EXPIRED | FAILED | AWAITING_CLARIFICATION
    resultRef: text('resultRef'),
    errorMessage: text('errorMessage'),
    expiresAt: timestamp('expiresAt').notNull(),
    confirmedAt: timestamp('confirmedAt'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('assistant_draft_tenant_idx').on(table.tenantId),
    statusIdx: index('assistant_draft_status_idx').on(table.status),
    linkIdx: index('assistant_draft_link_idx').on(table.channelLinkId),
  })
)

/** Alias coloquiales de productos para el resolver (p. ej. "coca 2 litros"). */
export const productAlias = pgTable(
  'product_alias',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    productId: text('productId').notNull(),
    alias: text('alias').notNull(),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    tenantAliasIdx: uniqueIndex('product_alias_tenant_alias_idx').on(
      table.tenantId,
      table.alias
    ),
    productIdx: index('product_alias_product_idx').on(table.productId),
  })
)
