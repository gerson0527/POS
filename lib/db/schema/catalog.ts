import {
  pgTable,
  text,
  timestamp,
  integer,
  decimal,
  index,
  unique } from 'drizzle-orm/pg-core'

// PRODUCT: Catálogo de productos
export const product = pgTable(
  'product',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    sku: text('sku').notNull(),
    barcode: text('barcode'),
    categoryId: text('categoryId'),
    category: text('category').default('General'),
    name: text('name').notNull(),
    description: text('description'),
    unitPrice: decimal('unitPrice', { precision: 12, scale: 4 }).notNull(),
    cost: decimal('cost', { precision: 12, scale: 4 }),
    margin: decimal('margin', { precision: 5, scale: 2 }).default('0.00'),
    ivaRate: decimal('ivaRate', { precision: 5, scale: 2 }).notNull().default('19.00'),
    unitMeasureCode: text('unitMeasureCode').default('94'), // 94=Unidad/EA
    standardCode: text('standardCode').default('999'), // 999=Estándar adopción
    schemeId: text('schemeId').default('0'), // 0=Ninguno
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    tenantSkuIdx: unique('product_tenant_sku').on(table.tenantId, table.sku),
    tenantBarcodeIdx: index('product_barcode_idx').on(table.tenantId, table.barcode),
  })
)

// INVENTORY: Stock por ubicación
export const inventory = pgTable(
  'inventory',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    locationId: text('locationId').notNull(),
    productId: text('productId').notNull(),
    quantity: decimal('quantity', { precision: 12, scale: 2 }).notNull().default('0'),
    reserved: decimal('reserved', { precision: 12, scale: 2 }).notNull().default('0'),
    available: decimal('available', { precision: 12, scale: 2 }).notNull().default('0'),
    reorderPoint: decimal('reorderPoint', { precision: 12, scale: 2 }).notNull().default('0'),
    lastCountedAt: timestamp('lastCountedAt'),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    uniq: unique('inventory_unique').on(table.locationId, table.productId),
    tenantIdx: index('inventory_tenant_idx').on(table.tenantId),
  })
)

// PRODUCT_CATEGORY: Categorías del catálogo de productos
export const productCategory = pgTable(
  'product_category',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    color: text('color').notNull().default('#FF6A00'), // para etiquetas visuales
    icon: text('icon'),
    productCount: integer('productCount').notNull().default(0),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE, INACTIVE
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('product_category_tenant_idx').on(table.tenantId),
    slugIdx: index('product_category_slug_idx').on(table.tenantId, table.slug),
    statusIdx: index('product_category_status_idx').on(table.status),
  })
)

// INVENTORY_MOVEMENT: Auditoría de movimientos de inventario
export const inventoryMovement = pgTable(
  'inventory_movement',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    locationId: text('locationId').notNull(),
    productId: text('productId').notNull(),
    movementType: text('movementType').notNull(),
    quantity: decimal('quantity', { precision: 12, scale: 2 }).notNull(),
    reference: text('reference'),
    referenceId: text('referenceId'),
    notes: text('notes'),
    userId: text('userId'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('inventory_movement_tenant_idx').on(table.tenantId),
    productIdx: index('inventory_movement_product_idx').on(table.productId),
    typeIdx: index('inventory_movement_type_idx').on(table.movementType),
  })
)
