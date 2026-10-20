CREATE TABLE IF NOT EXISTS "cash_movement" (
  "id" text PRIMARY KEY NOT NULL,
  "tenantId" text NOT NULL,
  "cashierSessionId" text NOT NULL,
  "type" text NOT NULL,
  "concept" text NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "note" text,
  "createdBy" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "cashier_session_open_user_unique"
  ON "cashier_session" ("tenantId", "userId")
  WHERE "status" = 'OPEN';

CREATE INDEX IF NOT EXISTS "cash_movement_session_idx" ON "cash_movement" ("cashierSessionId");
CREATE INDEX IF NOT EXISTS "cash_movement_tenant_idx" ON "cash_movement" ("tenantId");
