-- 0007_good_smiling_tiger.sql
--
-- 1) Modo de transmisión a la DIAN por empresa:
--    AUTO   → el POS transmite la factura al completar la venta (comportamiento actual).
--    MANUAL → la venta queda PENDIENTE y la contadora (rol ACCOUNTANT) revisa el IVA
--              y transmite la factura desde /dashboard/invoices.
-- 2) Rol ACCOUNTANT: en bases donde user_tenant.role es un ENUM se agrega el valor;
--    en producción la columna es TEXT y no requiere cambios.
-- 3) Normalización idempotente de objetos que ya existían en 0005/0006 pero cuyo
--    snapshot de drizzle estaba desactualizado al generar este archivo.
--    Todo es IF NOT EXISTS para que la migración sea segura en cualquier base
--    (producción, local o bases preexistentes).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'UserRole' AND n.nspname = 'public'
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';
    ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'VIEWER';
  END IF;
END $$;
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fiscal_outbox" (
  "id" text PRIMARY KEY NOT NULL,
  "tenantId" text NOT NULL,
  "saleId" text NOT NULL,
  "eventType" text DEFAULT 'EMIT_INVOICE' NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "maxAttempts" integer DEFAULT 10 NOT NULL,
  "nextAttemptAt" timestamp NOT NULL DEFAULT now(),
  "lockedAt" timestamp,
  "lastError" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "tenant"
  ADD COLUMN IF NOT EXISTS "dianTransmissionMode" text DEFAULT 'AUTO' NOT NULL;
--> statement-breakpoint
ALTER TABLE "customer_credit_transaction"
  ADD COLUMN IF NOT EXISTS "paidAmount" numeric(12, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "cashier_session"
  ADD COLUMN IF NOT EXISTS "businessDate" date;
--> statement-breakpoint
UPDATE "cashier_session"
SET "businessDate" = "openedAt"::date
WHERE "businessDate" IS NULL;
--> statement-breakpoint
ALTER TABLE "cashier_session"
  ALTER COLUMN "businessDate" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "cashier_session"
  ADD COLUMN IF NOT EXISTS "isOverride" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "cashier_session"
  ADD COLUMN IF NOT EXISTS "authorizedBy" text;
--> statement-breakpoint
ALTER TABLE "cashier_session"
  ADD COLUMN IF NOT EXISTS "overrideReason" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_movement_session_idx" ON "cash_movement" USING btree ("cashierSessionId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_movement_tenant_idx" ON "cash_movement" USING btree ("tenantId");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_outbox_sale_event_unique" ON "fiscal_outbox" USING btree ("tenantId","saleId","eventType");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fiscal_outbox_pending_idx" ON "fiscal_outbox" USING btree ("status","nextAttemptAt");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fiscal_outbox_tenant_idx" ON "fiscal_outbox" USING btree ("tenantId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cashier_session_business_date_idx" ON "cashier_session" USING btree ("tenantId","businessDate");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cashier_session_location_status_idx" ON "cashier_session" USING btree ("tenantId","locationId","status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cashier_session_open_user_unique" ON "cashier_session" USING btree ("tenantId","userId") WHERE "cashier_session"."status" = 'OPEN' AND "cashier_session"."isOverride" = false;
