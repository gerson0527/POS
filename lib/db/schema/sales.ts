import {
  pgTable,
  text,
  timestamp,
  integer,
  decimal,
  jsonb,
  index } from 'drizzle-orm/pg-core'

export const cashierSession = pgTable(
  'cashier_session',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    locationId: text('locationId').notNull(),
    userId: text('userId').notNull(),
    openedAt: timestamp('openedAt').notNull().defaultNow(),
    closedAt: timestamp('closedAt'),
    openingBalance: decimal('openingBalance', { precision: 12, scale: 2 }).notNull().default('0'),
    closingBalance: decimal('closingBalance', { precision: 12, scale: 2 }),
    expectedBalance: decimal('expectedBalance', { precision: 12, scale: 2 }),
    difference: decimal('difference', { precision: 12, scale: 2 }),
    totalSales: decimal('totalSales', { precision: 12, scale: 2 }).default('0'),
    cashSales: decimal('cashSales', { precision: 12, scale: 2 }).default('0'),
    cardSales: decimal('cardSales', { precision: 12, scale: 2 }).default('0'),
    transferSales: decimal('transferSales', { precision: 12, scale: 2 }).default('0'),
    creditSales: decimal('creditSales', { precision: 12, scale: 2 }).default('0'),
    salesCount: integer('salesCount').default(0),
    status: text('status').notNull().default('OPEN'), // OPEN, CLOSED, SUSPENDED
    notes: text('notes'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('cashier_session_tenant_idx').on(table.tenantId),
    statusIdx: index('cashier_session_status_idx').on(table.status),
    openedAtIdx: index('cashier_session_opened_at_idx').on(table.openedAt),
  })
)

// SALE: Transacciones de venta
export const sale = pgTable(
  'sale',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    locationId: text('locationId').notNull(),
    cashierSessionId: text('cashierSessionId').notNull(),
    userId: text('userId').notNull(),
    ticketNumber: integer('ticketNumber'),
    status: text('status').notNull().default('DRAFT'), // DRAFT, CONFIRMED, COMPLETED, CANCELLED
    subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
    taxAmount: decimal('taxAmount', { precision: 12, scale: 2 }).notNull().default('0'),
    total: decimal('total', { precision: 12, scale: 2 }).notNull(),
    discountAmount: decimal('discountAmount', { precision: 12, scale: 2 }).notNull().default('0'),
    discountPercentage: decimal('discountPercentage', { precision: 5, scale: 2 }).notNull().default('0'),
    notes: text('notes'),
    customerDocType: text('customerDocType'),
    customerDocNumber: text('customerDocNumber'),
    customerName: text('customerName'),
    customerEmail: text('customerEmail'),
    customerPhone: text('customerPhone'),
    customerAddress: text('customerAddress'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
    completedAt: timestamp('completedAt'),
  },
  (table) => ({
    tenantIdx: index('sale_tenant_idx').on(table.tenantId),
    statusIdx: index('sale_status_idx').on(table.status),
    createdAtIdx: index('sale_createdAt_idx').on(table.createdAt),
    customerDocIdx: index('sale_customer_doc_idx').on(table.customerDocNumber),
  })
)

// SALE_ITEM: Líneas de la venta
export const saleItem = pgTable(
  'sale_item',
  {
    id: text('id').primaryKey(),
    saleId: text('saleId').notNull(),
    productId: text('productId').notNull(),
    quantity: decimal('quantity', { precision: 12, scale: 2 }).notNull(),
    unitPrice: decimal('unitPrice', { precision: 12, scale: 4 }).notNull(),
    ivaRate: decimal('ivaRate', { precision: 5, scale: 2 }).notNull(),
    ivaAmount: decimal('ivaAmount', { precision: 12, scale: 2 }).notNull(),
    lineTotal: decimal('lineTotal', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    saleIdx: index('sale_item_sale_idx').on(table.saleId),
  })
)

// PAYMENT: Pagos de la venta
export const payment = pgTable(
  'payment',
  {
    id: text('id').primaryKey(),
    saleId: text('saleId').notNull(),
    method: text('method').notNull(), // CASH, CARD, TRANSFER, WALLET, etc
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    status: text('status').notNull().default('PENDING'), // PENDING, APPROVED, REJECTED, CANCELLED
    reference: text('reference'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    processedAt: timestamp('processedAt'),
  },
  (table) => ({
    saleIdx: index('payment_sale_idx').on(table.saleId),
    statusIdx: index('payment_status_idx').on(table.status),
  })
)
