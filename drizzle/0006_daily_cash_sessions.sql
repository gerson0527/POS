ALTER TABLE "cashier_session"
  ADD COLUMN IF NOT EXISTS "businessDate" date;

UPDATE "cashier_session"
SET "businessDate" = "openedAt"::date
WHERE "businessDate" IS NULL;

ALTER TABLE "cashier_session"
  ALTER COLUMN "businessDate" SET NOT NULL;

ALTER TABLE "cashier_session"
  ADD COLUMN IF NOT EXISTS "isOverride" boolean NOT NULL DEFAULT false;
ALTER TABLE "cashier_session"
  ADD COLUMN IF NOT EXISTS "authorizedBy" text;
ALTER TABLE "cashier_session"
  ADD COLUMN IF NOT EXISTS "overrideReason" text;

DROP INDEX IF EXISTS "cashier_session_open_user_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "cashier_session_open_user_unique"
  ON "cashier_session" ("tenantId", "userId")
  WHERE "status" = 'OPEN' AND "isOverride" = false;

CREATE INDEX IF NOT EXISTS "cashier_session_business_date_idx"
  ON "cashier_session" ("tenantId", "businessDate");

CREATE INDEX IF NOT EXISTS "cashier_session_location_status_idx"
  ON "cashier_session" ("tenantId", "locationId", "status");
