ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "assistantWhatsappAccessToken" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "assistantWhatsappPhoneNumberId" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "assistantWhatsappVerifyToken" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "assistantWhatsappDisplayPhone" text;
