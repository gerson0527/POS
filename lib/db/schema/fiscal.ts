import {
  pgTable,
  text,
  timestamp,
  integer,
  decimal,
  jsonb,
  index,
  unique } from 'drizzle-orm/pg-core'

// NUMERATION: Numeración fiscal DIAN
export const numeration = pgTable(
  'numeration',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    resolution: text('resolution').notNull(),
    prefix: text('prefix').notNull(),
    startRange: integer('startRange').notNull(),
    endRange: integer('endRange').notNull(),
    currentNumber: integer('currentNumber').notNull(),
    documentType: text('documentType').notNull(), // INVOICE, CREDIT_NOTE, DEBIT_NOTE
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    uniq: unique('numeration_unique').on(table.tenantId, table.resolution, table.prefix),
    tenantIdx: index('numeration_tenant_idx').on(table.tenantId),
  })
)

// FISCAL_DOCUMENT: Documentos fiscales DIAN (Facturas electrónicas, Notas débito/crédito)
// Fase 4.24: modelo fiscal único — absorbe la reserva de consecutivo local
// (antes invoice_number) y el documento electrónico (antes invoice).
export const fiscalDocument = pgTable(
  'fiscal_document',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    branchId: text('branchId'),
    saleId: text('saleId').notNull(),
    documentType: text('documentType').notNull().default('INVOICE'),
    technicalVersion: text('technicalVersion').default('1.9'),
    status: text('status').notNull().default('PENDING_GENERATION'),
    prefix: text('prefix'),
    consecutive: decimal('consecutive', { precision: 12, scale: 0 }),
    fullNumber: text('fullNumber'),
    uniqueCode: text('uniqueCode'),
    issueDate: timestamp('issueDate').defaultNow(),
    issueTime: text('issueTime'),
    issuerSnapshot: jsonb('issuerSnapshot'),
    customerSnapshot: jsonb('customerSnapshot'),
    totalsSnapshot: jsonb('totalsSnapshot'),
    paymentSnapshot: jsonb('paymentSnapshot'),
    qrCodeContent: text('qrCodeContent'),
    pdfStorageKey: text('pdfStorageKey'),
    xmlSignedStorageKey: text('xmlSignedStorageKey'),
    correlationId: text('correlationId'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('fiscal_document_tenant_idx').on(table.tenantId),
    saleIdx: index('fiscal_document_sale_idx').on(table.saleId),
  })
)
