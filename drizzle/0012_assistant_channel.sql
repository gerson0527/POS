CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_link" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"userId" text NOT NULL,
	"channel" text NOT NULL,
	"externalUserId" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"linkCode" text,
	"linkedAt" timestamp,
	"expiresAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_message" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"externalUpdateId" text NOT NULL,
	"externalUserId" text NOT NULL,
	"tenantId" text,
	"userId" text,
	"type" text NOT NULL,
	"rawText" text,
	"transcript" text,
	"mediaRef" text,
	"callbackData" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assistant_draft" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"userId" text NOT NULL,
	"channelLinkId" text NOT NULL,
	"channelMessageId" text,
	"intent" text NOT NULL,
	"extractedJson" jsonb NOT NULL,
	"resolvedJson" jsonb,
	"summary" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"resultRef" text,
	"errorMessage" text,
	"expiresAt" timestamp NOT NULL,
	"confirmedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_alias" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"productId" text NOT NULL,
	"alias" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_link_tenant_idx" ON "channel_link" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_link_user_idx" ON "channel_link" USING btree ("tenantId","userId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "channel_link_code_idx" ON "channel_link" USING btree ("linkCode") WHERE "linkCode" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "channel_link_external_idx" ON "channel_link" USING btree ("channel","externalUserId") WHERE "externalUserId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "channel_message_update_idx" ON "channel_message" USING btree ("channel","externalUpdateId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_message_tenant_idx" ON "channel_message" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_draft_tenant_idx" ON "assistant_draft" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_draft_status_idx" ON "assistant_draft" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assistant_draft_link_idx" ON "assistant_draft" USING btree ("channelLinkId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_alias_tenant_alias_idx" ON "product_alias" USING btree ("tenantId","alias");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_alias_product_idx" ON "product_alias" USING btree ("productId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_name_trgm_idx" ON "product" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_alias_trgm_idx" ON "product_alias" USING gin ("alias" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_name_trgm_idx" ON "customer" USING gin ("name" gin_trgm_ops);
