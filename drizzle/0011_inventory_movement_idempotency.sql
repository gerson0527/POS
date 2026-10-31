ALTER TABLE "inventory_movement" ADD COLUMN IF NOT EXISTS "reason" text;--> statement-breakpoint
ALTER TABLE "inventory_movement" ADD COLUMN IF NOT EXISTS "idempotencyKey" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_movement_idempotency_idx" ON "inventory_movement" USING btree ("tenantId","idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
