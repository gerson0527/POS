CREATE TABLE IF NOT EXISTS "customer_return" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"saleId" text NOT NULL,
	"locationId" text NOT NULL,
	"userId" text NOT NULL,
	"cashierSessionId" text,
	"returnNumber" integer NOT NULL,
	"status" text DEFAULT 'COMPLETED' NOT NULL,
	"reason" text NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"taxAmount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"refundMethod" text NOT NULL,
	"refundReference" text,
	"cashMovementId" text,
	"creditTransactionId" text,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_return_item" (
	"id" text PRIMARY KEY NOT NULL,
	"returnId" text NOT NULL,
	"saleItemId" text NOT NULL,
	"productId" text NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"unitPrice" numeric(12, 4) NOT NULL,
	"ivaRate" numeric(5, 2) NOT NULL,
	"ivaAmount" numeric(12, 2) NOT NULL,
	"lineTotal" numeric(12, 2) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_return_tenant_idx" ON "customer_return" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_return_sale_idx" ON "customer_return" USING btree ("saleId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_return_created_at_idx" ON "customer_return" USING btree ("tenantId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_return_session_idx" ON "customer_return" USING btree ("cashierSessionId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customer_return_number_unique" ON "customer_return" USING btree ("tenantId","returnNumber");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_return_item_return_idx" ON "customer_return_item" USING btree ("returnId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_return_item_sale_item_idx" ON "customer_return_item" USING btree ("saleItemId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_return_item_product_idx" ON "customer_return_item" USING btree ("productId");
