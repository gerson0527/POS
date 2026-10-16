'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { AuditAction } from '@/lib/types'
import { and, eq, desc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUserId, getTenantId, logAudit } from './_shared'
export async function getPurchaseOrdersList() {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const posList = await db
    .select({
      id: schema.purchaseOrder.id,
      tenantId: schema.purchaseOrder.tenantId,
      supplierId: schema.purchaseOrder.supplierId,
      poNumber: schema.purchaseOrder.poNumber,
      userId: schema.purchaseOrder.userId,
      status: schema.purchaseOrder.status,
      total: schema.purchaseOrder.total,
      notes: schema.purchaseOrder.notes,
      createdAt: schema.purchaseOrder.createdAt,
      supplierName: schema.supplier.name,
    })
    .from(schema.purchaseOrder)
    .leftJoin(schema.supplier, eq(schema.purchaseOrder.supplierId, schema.supplier.id))
    .where(eq(schema.purchaseOrder.tenantId, tenantId))
    .orderBy(desc(schema.purchaseOrder.createdAt))

  return posList
}

export async function createPurchaseOrder(input: {
  supplierId: string
  poNumber: string
  total: number
  notes?: string
  productId?: string
  productName?: string
  quantity?: number
  cost?: number
  unitPrice?: number
  margin?: number
  updateCatalogProduct?: boolean
}) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)
  const id = `po_${Date.now()}`

  // Si se seleccionó un producto existente, actualizar su catálogo e inventario
  if (input.productId) {
    const existing = await db
      .select()
      .from(schema.product)
      .where(and(eq(schema.product.id, input.productId), eq(schema.product.tenantId, tenantId)))
      .limit(1)

    if (existing.length > 0) {
      // Auto-actualizar precio unitario, costo y margen en el catálogo si fue indicado
      if (input.updateCatalogProduct !== false) {
        const u = input.unitPrice !== undefined && !isNaN(input.unitPrice) ? String(input.unitPrice) : existing[0].unitPrice
        const c = input.cost !== undefined && !isNaN(input.cost) ? String(input.cost) : existing[0].cost
        const m = input.margin !== undefined && !isNaN(input.margin) ? String(input.margin) : existing[0].margin

        await db
          .update(schema.product)
          .set({
            unitPrice: u,
            cost: c,
            margin: m,
            updatedAt: new Date(),
          })
          .where(eq(schema.product.id, input.productId))
      }

      // Auto-incrementar stock de inventario
      if (input.quantity && input.quantity > 0) {
        const inv = await db
          .select()
          .from(schema.inventory)
          .where(eq(schema.inventory.productId, input.productId))
          .limit(1)

        if (inv.length > 0) {
          const currentQty = Number(inv[0].quantity || 0)
          const newQty = currentQty + input.quantity
          await db
            .update(schema.inventory)
            .set({
              quantity: String(newQty),
              available: String(newQty),
              updatedAt: new Date(),
            })
            .where(eq(schema.inventory.id, inv[0].id))
        } else {
          await db.insert(schema.inventory).values({
            id: `inv_${Date.now()}`,
            tenantId,
            locationId: 'loc_default',
            productId: input.productId,
            quantity: String(input.quantity),
            available: String(input.quantity),
          })
        }
      }
    }
  }

  const notesWithDetails = [
    input.notes,
    input.productName ? `Producto: ${input.productName}` : null,
    input.quantity ? `Cantidad: ${input.quantity}` : null,
    input.cost !== undefined ? `Costo: $${input.cost}` : null,
    input.unitPrice !== undefined ? `Precio Venta: $${input.unitPrice}` : null,
    input.margin !== undefined ? `Margen: ${input.margin}%` : null,
  ]
    .filter(Boolean)
    .join(' | ')

  await db.insert(schema.purchaseOrder).values({
    id,
    tenantId,
    supplierId: input.supplierId,
    poNumber: input.poNumber,
    userId,
    status: 'COMPLETED',
    total: String(input.total),
    subtotal: String(input.total),
    notes: notesWithDetails || null,
  })

  await logAudit(tenantId, userId, AuditAction.CREATE, 'purchase_order', id, input)
  revalidatePath('/dashboard/inventory')
  return { id, success: true }
}

