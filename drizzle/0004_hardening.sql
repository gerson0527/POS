ALTER TABLE "customer_credit_transaction"
  ADD COLUMN IF NOT EXISTS "paidAmount" numeric(12, 2) NOT NULL DEFAULT '0';

CREATE TABLE IF NOT EXISTS "fiscal_outbox" (
  "id" text PRIMARY KEY NOT NULL,
  "tenantId" text NOT NULL,
  "saleId" text NOT NULL,
  "eventType" text NOT NULL DEFAULT 'EMIT_INVOICE',
  "status" text NOT NULL DEFAULT 'PENDING',
  "attempts" integer NOT NULL DEFAULT 0,
  "maxAttempts" integer NOT NULL DEFAULT 10,
  "nextAttemptAt" timestamp NOT NULL DEFAULT now(),
  "lockedAt" timestamp,
  "lastError" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_outbox_sale_event_unique"
  ON "fiscal_outbox" ("tenantId", "saleId", "eventType");
CREATE INDEX IF NOT EXISTS "fiscal_outbox_pending_idx"
  ON "fiscal_outbox" ("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "fiscal_outbox_tenant_idx"
  ON "fiscal_outbox" ("tenantId");

CREATE TABLE IF NOT EXISTS "api_key" (
  "id" text PRIMARY KEY NOT NULL,
  "tenantId" text NOT NULL,
  "name" text NOT NULL,
  "keyHash" text NOT NULL,
  "keyPrefix" text NOT NULL,
  "rateLimit" integer NOT NULL DEFAULT 1000,
  "rateLimitWindow" text NOT NULL DEFAULT '1h',
  "scopes" text NOT NULL DEFAULT 'read',
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "lastUsedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "expiresAt" timestamp,
  CONSTRAINT "api_key_keyHash_unique" UNIQUE ("keyHash")
);

CREATE INDEX IF NOT EXISTS "ak_tenant_idx" ON "api_key" ("tenantId");
CREATE INDEX IF NOT EXISTS "ak_status_idx" ON "api_key" ("status");

CREATE TABLE IF NOT EXISTS "rate_limit_bucket" (
  "id" text PRIMARY KEY NOT NULL,
  "window_start" timestamp NOT NULL,
  "count" integer NOT NULL DEFAULT 1
);
