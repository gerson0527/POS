import {
  pgTable,
  text,
  timestamp,
  decimal,
  index,
  unique } from 'drizzle-orm/pg-core'

// SUPPLIER: Gestión de proveedores
export const supplier = pgTable(
  'supplier',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    name: text('name').notNull(),
    nit: text('nit').unique(),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    city: text('city'),
    contactPerson: text('contactPerson'),
    paymentTerms: text('paymentTerms'),
    status: text('status').notNull().default('ACTIVE'),
    notes: text('notes'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('supplier_tenant_idx').on(table.tenantId),
    nitIdx: index('supplier_nit_idx').on(table.nit),
  })
)

// PURCHASE_ORDER: Órdenes de compra
export const purchaseOrder = pgTable(
  'purchase_order',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    supplierId: text('supplierId').notNull(),
    poNumber: text('poNumber').notNull(),
    userId: text('userId').notNull(),
    status: text('status').notNull().default('DRAFT'),
    subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
    taxAmount: decimal('taxAmount', { precision: 12, scale: 2 }).notNull().default('0'),
    total: decimal('total', { precision: 12, scale: 2 }).notNull().default('0'),
    expectedDeliveryDate: text('expectedDeliveryDate'),
    receivedDate: text('receivedDate'),
    notes: text('notes'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('po_tenant_idx').on(table.tenantId),
    statusIdx: index('po_status_idx').on(table.status),
    supplierIdx: index('po_supplier_idx').on(table.supplierId),
    unique_po: unique('unique_po').on(table.tenantId, table.poNumber),
  })
)

// PURCHASE_ORDER_ITEM: Items de órdenes de compra
export const purchaseOrderItem = pgTable(
  'purchase_order_item',
  {
    id: text('id').primaryKey(),
    purchaseOrderId: text('purchaseOrderId').notNull(),
    productId: text('productId').notNull(),
    quantity: decimal('quantity', { precision: 12, scale: 2 }).notNull(),
    unitCost: decimal('unitCost', { precision: 12, scale: 4 }).notNull(),
    lineTotal: decimal('lineTotal', { precision: 12, scale: 2 }).notNull(),
    receivedQuantity: decimal('receivedQuantity', { precision: 12, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    poIdx: index('po_item_po_idx').on(table.purchaseOrderId),
  })
)
