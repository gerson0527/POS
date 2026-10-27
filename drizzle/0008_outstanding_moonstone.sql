ALTER TABLE "tenant" ADD COLUMN "fiscalMunicipalityCode" text DEFAULT '11001';--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "fiscalTributeCode" text DEFAULT 'ZZ';--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "taxTreatment" text DEFAULT 'TAXED' NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_document" ADD COLUMN "itemsSnapshot" jsonb;--> statement-breakpoint
ALTER TABLE "fiscal_outbox" ADD COLUMN "requiresManualApproval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_outbox" ADD COLUMN "needsReconciliation" boolean DEFAULT false NOT NULL;