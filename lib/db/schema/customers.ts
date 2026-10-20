import {
  pgTable,
  text,
  timestamp,
  decimal,
  index } from 'drizzle-orm/pg-core'

// CUSTOMER: Clientes / compradores para facturación electrónica DIAN
export const customer = pgTable(
  'customer',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    documentType: text('documentType').notNull(),
    documentNumber: text('documentNumber').notNull(),
    personType: text('personType').notNull().default('NATURAL'), // NATURAL, JURIDICA
    name: text('name').notNull(),
    tradeName: text('tradeName'),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    city: text('city'),
    department: text('department'),
    taxRegime: text('taxRegime'), // SIMPLIFIED, COMMON, EXEMPT, NOT_APPLICABLE
    identificationDocumentCode: text('identificationDocumentCode').default('13'), // 13=CC, 31=NIT
    legalOrganizationCode: text('legalOrganizationCode').default('2'), // 1=PJ, 2=PN
    municipalityCode: text('municipalityCode').default('11001'), // 11001=Bogota
    tributeCode: text('tributeCode').default('ZZ'), // ZZ=No aplica
    status: text('status').notNull().default('ACTIVE'), // ACTIVE, INACTIVE
    creditEnabled: text('creditEnabled').notNull().default('NO'), // NO, SI
    creditLimit: decimal('creditLimit', { precision: 12, scale: 2 }).notNull().default('0'),
    creditBalance: decimal('creditBalance', { precision: 12, scale: 2 }).notNull().default('0'),
    creditStatus: text('creditStatus').notNull().default('AL_DIA'), // AL_DIA, EN_MORA, BLOQUEADO
    notes: text('notes'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('customer_tenant_idx').on(table.tenantId),
    docIdx: index('customer_doc_idx').on(table.tenantId, table.documentNumber),
    nameIdx: index('customer_name_idx').on(table.tenantId, table.name),
    statusIdx: index('customer_status_idx').on(table.status),
    creditStatusIdx: index('customer_credit_status_idx').on(table.tenantId, table.creditStatus),
  })
)

// CUSTOMER_CREDIT_TRANSACTION: Movimientos de la cuenta corriente (cargos y abonos)
export const customerCreditTransaction = pgTable(
  'customer_credit_transaction',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    customerId: text('customerId').notNull(),
    type: text('type').notNull(), // CHARGE (cargo), PAYMENT (abono)
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    paidAmount: decimal('paidAmount', { precision: 12, scale: 2 }).notNull().default('0'),
    balanceAfter: decimal('balanceAfter', { precision: 12, scale: 2 }).notNull(),
    saleId: text('saleId'),
    note: text('note'),
    dueDate: timestamp('dueDate'),
    status: text('status').notNull().default('PENDIENTE'), // PENDIENTE, PAGADO, VENCIDO
    paymentMethod: text('paymentMethod'), // CASH, CARD, TRANSFER
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('cct_tenant_idx').on(table.tenantId),
    customerIdx: index('cct_customer_idx').on(table.customerId),
    saleIdx: index('cct_sale_idx').on(table.saleId),
    statusIdx: index('cct_status_idx').on(table.status, table.customerId),
    dueDateIdx: index('cct_due_idx').on(table.dueDate, table.status),
  })
)
