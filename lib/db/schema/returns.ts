import {
  pgTable,
  text,
  timestamp,
  integer,
  decimal,
  index,
  uniqueIndex } from 'drizzle-orm/pg-core'

// CUSTOMER_RETURN: Devoluciones de cliente sobre ventas completadas.
// Módulo 100% operativo del sistema: NO genera documentos electrónicos DIAN.
// Cada devolución deja rastro en inventario (entrada), caja (DEVOLUCION),
// cartera del cliente (abono) y auditoría, según el medio de reembolso.
export const customerReturn = pgTable(
  'customer_return',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    saleId: text('saleId').notNull(),
    locationId: text('locationId').notNull(),
    userId: text('userId').notNull(),
    cashierSessionId: text('cashierSessionId'),
    returnNumber: integer('returnNumber').notNull(),
    status: text('status').notNull().default('COMPLETED'), // COMPLETED
    reason: text('reason').notNull(),
    subtotal: decimal('subtotal', { precision: 12, scale: 2 }).notNull(),
    taxAmount: decimal('taxAmount', { precision: 12, scale: 2 }).notNull().default('0'),
    total: decimal('total', { precision: 12, scale: 2 }).notNull(),
    // CASH, CARD, TRANSFER, CREDIT_BALANCE
    refundMethod: text('refundMethod').notNull(),
    refundReference: text('refundReference'),
    // Enlaces a los movimientos generados (trazabilidad completa).
    cashMovementId: text('cashMovementId'),
    creditTransactionId: text('creditTransactionId'),
    notes: text('notes'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('customer_return_tenant_idx').on(table.tenantId),
    saleIdx: index('customer_return_sale_idx').on(table.saleId),
    createdAtIdx: index('customer_return_created_at_idx').on(table.tenantId, table.createdAt),
    sessionIdx: index('customer_return_session_idx').on(table.cashierSessionId),
    numberUnique: uniqueIndex('customer_return_number_unique').on(
      table.tenantId,
      table.returnNumber
    ),
  })
)

// CUSTOMER_RETURN_ITEM: Líneas devueltas con su valor efectivo (después de
// descuentos y redondeos de la venta original).
export const customerReturnItem = pgTable(
  'customer_return_item',
  {
    id: text('id').primaryKey(),
    returnId: text('returnId').notNull(),
    saleItemId: text('saleItemId').notNull(),
    productId: text('productId').notNull(),
    quantity: decimal('quantity', { precision: 12, scale: 2 }).notNull(),
    unitPrice: decimal('unitPrice', { precision: 12, scale: 4 }).notNull(),
    ivaRate: decimal('ivaRate', { precision: 5, scale: 2 }).notNull(),
    ivaAmount: decimal('ivaAmount', { precision: 12, scale: 2 }).notNull(),
    lineTotal: decimal('lineTotal', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    returnIdx: index('customer_return_item_return_idx').on(table.returnId),
    saleItemIdx: index('customer_return_item_sale_item_idx').on(table.saleItemId),
    productIdx: index('customer_return_item_product_idx').on(table.productId),
  })
)
