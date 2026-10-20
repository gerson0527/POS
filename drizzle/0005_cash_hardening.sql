CREATE UNIQUE INDEX IF NOT EXISTS "cashier_session_open_user_unique"
  ON "cashier_session" ("tenantId", "userId")
  WHERE "status" = 'OPEN';

CREATE INDEX IF NOT EXISTS "cash_movement_session_idx" ON "cash_movement" ("cashierSessionId");
CREATE INDEX IF NOT EXISTS "cash_movement_tenant_idx" ON "cash_movement" ("tenantId");
