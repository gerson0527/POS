ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "assistantEnabled" text DEFAULT 'NO' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "assistantTelegramBotToken" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "assistantTelegramBotUsername" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "assistantTelegramWebhookSecret" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "assistantLlmBaseUrl" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "assistantLlmApiKey" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "assistantLlmModel" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "assistantSttProvider" text DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "assistantSttApiKey" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "assistantSttModel" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "assistantSttBaseUrl" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "assistantDraftTtlMinutes" integer DEFAULT 10;
