'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { AuditAction } from '@/lib/types'
import { and, eq, desc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUserId, getTenantId, logAudit } from './_shared'
export async function getInventoryStats() {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const productsList = await db
    .select({
      id: schema.product.id,
      name: schema.product.name,
      unitPrice: schema.product.unitPrice,
      cost: schema.product.cost,
      quantity: schema.inventory.quantity,
    })
    .from(schema.product)
    .leftJoin(schema.inventory, eq(schema.product.id, schema.inventory.productId))
    .where(eq(schema.product.tenantId, tenantId))

  const totalProducts = productsList.length
  const totalStockValue = productsList.reduce(
    (acc, p) => acc + (Number(p.unitPrice) || 0) * (Number(p.quantity) || 0),
    0
  )
  const lowStockProducts = productsList.filter((p) => (Number(p.quantity) || 0) < 10)

  const posList = await db
    .select()
    .from(schema.purchaseOrder)
    .where(and(eq(schema.purchaseOrder.tenantId, tenantId), eq(schema.purchaseOrder.status, 'DRAFT')))

  return {
    totalProducts,
    totalStockValue,
    lowStockCount: lowStockProducts.length,
    lowStockProducts,
    pendingPOsCount: posList.length
  }
}

export async function getInventoryMovementsList() {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const movs = await db
    .select({
      id: schema.inventoryMovement.id,
      tenantId: schema.inventoryMovement.tenantId,
      locationId: schema.inventoryMovement.locationId,
      productId: schema.inventoryMovement.productId,
      movementType: schema.inventoryMovement.movementType,
      quantity: schema.inventoryMovement.quantity,
      reference: schema.inventoryMovement.reference,
      notes: schema.inventoryMovement.notes,
      createdAt: schema.inventoryMovement.createdAt,
      productName: schema.product.name,
      sku: schema.product.sku,
    })
    .from(schema.inventoryMovement)
    .leftJoin(schema.product, eq(schema.inventoryMovement.productId, schema.product.id))
    .where(eq(schema.inventoryMovement.tenantId, tenantId))
    .orderBy(desc(schema.inventoryMovement.createdAt))

  return movs
}

export async function recordInventoryMovement(input: { productId: string; movementType: 'IN' | 'OUT' | 'ADJUSTMENT'; quantity: number; notes?: string }) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)
  const id = `mov_${Date.now()}`

  const locations = await db.select().from(schema.location).where(eq(schema.location.tenantId, tenantId)).limit(1)
  const locationId = locations[0]?.id || 'loc_default'

  await db.insert(schema.inventoryMovement).values({
    id,
    tenantId,
    locationId,
    productId: input.productId,
    movementType: input.movementType,
    quantity: String(input.quantity),
    notes: input.notes || null,
    userId,
  })

  const existingInv = await db.select().from(schema.inventory).where(and(eq(schema.inventory.locationId, locationId), eq(schema.inventory.productId, input.productId))).limit(1)
  if (existingInv.length) {
    const currentQty = parseFloat(existingInv[0].quantity) || 0
    const newQty = input.movementType === 'OUT' ? currentQty - input.quantity : currentQty + input.quantity
    await db.update(schema.inventory).set({ quantity: String(newQty), available: String(newQty) }).where(eq(schema.inventory.id, existingInv[0].id))
  } else {
    const invId = `inv_${Date.now()}`
    await db.insert(schema.inventory).values({
      id: invId,
      tenantId,
      locationId,
      productId: input.productId,
      quantity: String(input.quantity),
      available: String(input.quantity),
    })
  }

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'inventory', id, input)
  revalidatePath('/dashboard/inventory')
  return { id, success: true }
}

