CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "location" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address" text,
	"city" text,
	"phone" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"nit" text NOT NULL,
	"legalName" text NOT NULL,
	"tradeName" text,
	"email" text,
	"phone" text,
	"address" text,
	"city" text,
	"department" text,
	"country" text DEFAULT 'Colombia',
	"legalRepresentative" text,
	"legalRepDocNumber" text,
	"economicActivity" text,
	"website" text,
	"logoUrl" text,
	"dbSlug" text DEFAULT 'default' NOT NULL,
	"dbProvisioned" text DEFAULT 'NO' NOT NULL,
	"dbLastSyncAt" timestamp,
	"onboardingCompleted" text DEFAULT 'NO' NOT NULL,
	"onboardingCompletedAt" timestamp,
	"onboardingCompletedBy" text,
	"certificateThumbprint" text,
	"dianSoftwareId" text,
	"dianSoftwarePin" text,
	"dianUsername" text,
	"dianPassword" text,
	"dianTestSetId" text,
	"dianEnvironment" text,
	"factusClientId" text,
	"factusClientSecret" text,
	"factusUsername" text,
	"factusPassword" text,
	"factusEnvironment" text DEFAULT 'sandbox',
	"factusNumberingRangeId" integer,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_nit_unique" UNIQUE("nit")
);
--> statement-breakpoint
CREATE TABLE "user_tenant" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"tenantId" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_tenant_unique" UNIQUE("userId","tenantId")
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"documentType" text NOT NULL,
	"documentNumber" text NOT NULL,
	"personType" text DEFAULT 'NATURAL' NOT NULL,
	"name" text NOT NULL,
	"tradeName" text,
	"email" text,
	"phone" text,
	"address" text,
	"city" text,
	"department" text,
	"taxRegime" text,
	"identificationDocumentCode" text DEFAULT '13',
	"legalOrganizationCode" text DEFAULT '2',
	"municipalityCode" text DEFAULT '11001',
	"tributeCode" text DEFAULT 'ZZ',
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"creditEnabled" text DEFAULT 'NO' NOT NULL,
	"creditLimit" numeric(12, 2) DEFAULT '0' NOT NULL,
	"creditBalance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"creditStatus" text DEFAULT 'AL_DIA' NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_credit_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"customerId" text NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"balanceAfter" numeric(12, 2) NOT NULL,
	"saleId" text,
	"note" text,
	"dueDate" timestamp,
	"status" text DEFAULT 'PENDIENTE' NOT NULL,
	"paymentMethod" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"locationId" text NOT NULL,
	"productId" text NOT NULL,
	"quantity" numeric(12, 2) DEFAULT '0' NOT NULL,
	"reserved" numeric(12, 2) DEFAULT '0' NOT NULL,
	"available" numeric(12, 2) DEFAULT '0' NOT NULL,
	"reorderPoint" numeric(12, 2) DEFAULT '0' NOT NULL,
	"lastCountedAt" timestamp,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_unique" UNIQUE("locationId","productId")
);
--> statement-breakpoint
CREATE TABLE "inventory_movement" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"locationId" text NOT NULL,
	"productId" text NOT NULL,
	"movementType" text NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"reference" text,
	"referenceId" text,
	"notes" text,
	"userId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"sku" text NOT NULL,
	"barcode" text,
	"categoryId" text,
	"category" text DEFAULT 'General',
	"name" text NOT NULL,
	"description" text,
	"unitPrice" numeric(12, 4) NOT NULL,
	"cost" numeric(12, 4),
	"margin" numeric(5, 2) DEFAULT '0.00',
	"ivaRate" numeric(5, 2) DEFAULT '19.00' NOT NULL,
	"unitMeasureCode" text DEFAULT '94',
	"standardCode" text DEFAULT '999',
	"schemeId" text DEFAULT '0',
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_tenant_sku" UNIQUE("tenantId","sku")
);
--> statement-breakpoint
CREATE TABLE "product_category" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#FF6A00' NOT NULL,
	"icon" text,
	"productCount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_alert" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"locationId" text NOT NULL,
	"productId" text NOT NULL,
	"alertType" text NOT NULL,
	"triggerQuantity" numeric(12, 2) NOT NULL,
	"currentQuantity" numeric(12, 2) NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledgedAt" timestamp,
	"acknowledgedBy" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_movement" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"cashierSessionId" text NOT NULL,
	"type" text NOT NULL,
	"concept" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"note" text,
	"createdBy" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cashier_session" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"locationId" text NOT NULL,
	"userId" text NOT NULL,
	"openedAt" timestamp DEFAULT now() NOT NULL,
	"closedAt" timestamp,
	"openingBalance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"closingBalance" numeric(12, 2),
	"expectedBalance" numeric(12, 2),
	"difference" numeric(12, 2),
	"totalSales" numeric(12, 2) DEFAULT '0',
	"cashSales" numeric(12, 2) DEFAULT '0',
	"cardSales" numeric(12, 2) DEFAULT '0',
	"transferSales" numeric(12, 2) DEFAULT '0',
	"creditSales" numeric(12, 2) DEFAULT '0',
	"salesCount" integer DEFAULT 0,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" text PRIMARY KEY NOT NULL,
	"saleId" text NOT NULL,
	"method" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reference" text,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"processedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "sale" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"locationId" text NOT NULL,
	"cashierSessionId" text NOT NULL,
	"userId" text NOT NULL,
	"ticketNumber" integer,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"taxAmount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"discountAmount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"discountPercentage" numeric(5, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"customerDocType" text,
	"customerDocNumber" text,
	"customerName" text,
	"customerEmail" text,
	"customerPhone" text,
	"customerAddress" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "sale_item" (
	"id" text PRIMARY KEY NOT NULL,
	"saleId" text NOT NULL,
	"productId" text NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"unitPrice" numeric(12, 4) NOT NULL,
	"ivaRate" numeric(5, 2) NOT NULL,
	"ivaAmount" numeric(12, 2) NOT NULL,
	"lineTotal" numeric(12, 2) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_document" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"branchId" text,
	"saleId" text NOT NULL,
	"documentType" text DEFAULT 'INVOICE' NOT NULL,
	"technicalVersion" text DEFAULT '1.9',
	"status" text DEFAULT 'PENDING_GENERATION' NOT NULL,
	"prefix" text,
	"consecutive" numeric(12, 0),
	"fullNumber" text,
	"uniqueCode" text,
	"issueDate" timestamp DEFAULT now(),
	"issueTime" text,
	"issuerSnapshot" jsonb,
	"customerSnapshot" jsonb,
	"totalsSnapshot" jsonb,
	"paymentSnapshot" jsonb,
	"qrCodeContent" text,
	"pdfStorageKey" text,
	"xmlSignedStorageKey" text,
	"correlationId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "numeration" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"resolution" text NOT NULL,
	"prefix" text NOT NULL,
	"startRange" integer NOT NULL,
	"endRange" integer NOT NULL,
	"currentNumber" integer NOT NULL,
	"documentType" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "numeration_unique" UNIQUE("tenantId","resolution","prefix")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"userId" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entityId" text NOT NULL,
	"changes" jsonb,
	"metadata" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"eventType" text NOT NULL,
	"aggregateId" text NOT NULL,
	"aggregateType" text NOT NULL,
	"payload" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"supplierId" text NOT NULL,
	"poNumber" text NOT NULL,
	"userId" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"taxAmount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"expectedDeliveryDate" text,
	"receivedDate" text,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_po" UNIQUE("tenantId","poNumber")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_item" (
	"id" text PRIMARY KEY NOT NULL,
	"purchaseOrderId" text NOT NULL,
	"productId" text NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"unitCost" numeric(12, 4) NOT NULL,
	"lineTotal" numeric(12, 2) NOT NULL,
	"receivedQuantity" numeric(12, 2) DEFAULT '0' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"name" text NOT NULL,
	"nit" text,
	"email" text,
	"phone" text,
	"address" text,
	"city" text,
	"contactPerson" text,
	"paymentTerms" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_nit_unique" UNIQUE("nit")
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"name" text NOT NULL,
	"keyHash" text NOT NULL,
	"keyPrefix" text NOT NULL,
	"rateLimit" integer DEFAULT 1000 NOT NULL,
	"rateLimitWindow" text DEFAULT '1h' NOT NULL,
	"scopes" text DEFAULT 'read' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"lastUsedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp,
	CONSTRAINT "api_key_keyHash_unique" UNIQUE("keyHash")
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"plan" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"monthlyPrice" numeric(12, 2) NOT NULL,
	"invoicesLimit" integer,
	"usersLimit" integer,
	"storageGb" integer,
	"currentInvoicesCount" integer DEFAULT 0 NOT NULL,
	"currentUsersCount" integer DEFAULT 0 NOT NULL,
	"currentStorageGb" numeric(10, 2) DEFAULT '0' NOT NULL,
	"billingCycleStart" text,
	"billingCycleEnd" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"cancelledAt" timestamp,
	CONSTRAINT "subscription_tenantId_unique" UNIQUE("tenantId")
);
--> statement-breakpoint
CREATE TABLE "webhook" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"url" text NOT NULL,
	"events" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"secret" text NOT NULL,
	"lastTriggeredAt" timestamp,
	"failureCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "location_tenant_idx" ON "location" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "location_code_idx" ON "location" USING btree ("tenantId","code");--> statement-breakpoint
CREATE INDEX "tenant_nit_idx" ON "tenant" USING btree ("nit");--> statement-breakpoint
CREATE INDEX "customer_tenant_idx" ON "customer" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "customer_doc_idx" ON "customer" USING btree ("tenantId","documentNumber");--> statement-breakpoint
CREATE INDEX "customer_name_idx" ON "customer" USING btree ("tenantId","name");--> statement-breakpoint
CREATE INDEX "customer_status_idx" ON "customer" USING btree ("status");--> statement-breakpoint
CREATE INDEX "customer_credit_status_idx" ON "customer" USING btree ("tenantId","creditStatus");--> statement-breakpoint
CREATE INDEX "cct_tenant_idx" ON "customer_credit_transaction" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "cct_customer_idx" ON "customer_credit_transaction" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX "cct_sale_idx" ON "customer_credit_transaction" USING btree ("saleId");--> statement-breakpoint
CREATE INDEX "cct_status_idx" ON "customer_credit_transaction" USING btree ("status","customerId");--> statement-breakpoint
CREATE INDEX "cct_due_idx" ON "customer_credit_transaction" USING btree ("dueDate","status");--> statement-breakpoint
CREATE INDEX "category_tenant_idx" ON "category" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "inventory_tenant_idx" ON "inventory" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "inventory_movement_tenant_idx" ON "inventory_movement" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "inventory_movement_product_idx" ON "inventory_movement" USING btree ("productId");--> statement-breakpoint
CREATE INDEX "inventory_movement_type_idx" ON "inventory_movement" USING btree ("movementType");--> statement-breakpoint
CREATE INDEX "product_barcode_idx" ON "product" USING btree ("tenantId","barcode");--> statement-breakpoint
CREATE INDEX "product_category_tenant_idx" ON "product_category" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "product_category_slug_idx" ON "product_category" USING btree ("tenantId","slug");--> statement-breakpoint
CREATE INDEX "product_category_status_idx" ON "product_category" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stock_alert_tenant_idx" ON "stock_alert" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "stock_alert_product_idx" ON "stock_alert" USING btree ("productId");--> statement-breakpoint
CREATE INDEX "stock_alert_acknowledged_idx" ON "stock_alert" USING btree ("acknowledged");--> statement-breakpoint
CREATE INDEX "cash_movement_tenant_idx" ON "cash_movement" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "cash_movement_session_idx" ON "cash_movement" USING btree ("cashierSessionId");--> statement-breakpoint
CREATE INDEX "cashier_session_tenant_idx" ON "cashier_session" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "cashier_session_status_idx" ON "cashier_session" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cashier_session_opened_at_idx" ON "cashier_session" USING btree ("openedAt");--> statement-breakpoint
CREATE INDEX "payment_sale_idx" ON "payment" USING btree ("saleId");--> statement-breakpoint
CREATE INDEX "payment_status_idx" ON "payment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sale_tenant_idx" ON "sale" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "sale_status_idx" ON "sale" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sale_createdAt_idx" ON "sale" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "sale_customer_doc_idx" ON "sale" USING btree ("customerDocNumber");--> statement-breakpoint
CREATE INDEX "sale_item_sale_idx" ON "sale_item" USING btree ("saleId");--> statement-breakpoint
CREATE INDEX "fiscal_document_tenant_idx" ON "fiscal_document" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "fiscal_document_sale_idx" ON "fiscal_document" USING btree ("saleId");--> statement-breakpoint
CREATE INDEX "numeration_tenant_idx" ON "numeration" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "audit_log_tenant_idx" ON "audit_log" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity");--> statement-breakpoint
CREATE INDEX "event_tenant_idx" ON "event" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "event_type_idx" ON "event" USING btree ("eventType");--> statement-breakpoint
CREATE INDEX "event_aggregate_idx" ON "event" USING btree ("aggregateType","aggregateId");--> statement-breakpoint
CREATE INDEX "po_tenant_idx" ON "purchase_order" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "po_status_idx" ON "purchase_order" USING btree ("status");--> statement-breakpoint
CREATE INDEX "po_supplier_idx" ON "purchase_order" USING btree ("supplierId");--> statement-breakpoint
CREATE INDEX "po_item_po_idx" ON "purchase_order_item" USING btree ("purchaseOrderId");--> statement-breakpoint
CREATE INDEX "supplier_tenant_idx" ON "supplier" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "supplier_nit_idx" ON "supplier" USING btree ("nit");--> statement-breakpoint
CREATE INDEX "ak_tenant_idx" ON "api_key" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "ak_status_idx" ON "api_key" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sub_tenant_idx" ON "subscription" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "sub_status_idx" ON "subscription" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wh_tenant_idx" ON "webhook" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "wh_status_idx" ON "webhook" USING btree ("status");