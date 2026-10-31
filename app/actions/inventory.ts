'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { and, eq, desc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUserId, getTenantId, requireActor } from './_shared'
import { safeAction } from './_result'
import {
  INVENTORY_MOVEMENT_ROLES,
  recordInventoryMovement as recordMovementForActor,
  resolveMovementLocation,
  type ManualMovementType,
} from '@/lib/inventory/service'
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

export async function recordInventoryMovement(input: {
  productId: string
  movementType: ManualMovementType
  quantity: number
  locationId?: string | null
  reason?: string | null
  notes?: string | null
  idempotencyKey?: string | null
}) {
  return safeAction(async () => {
    const actor = await requireActor([...INVENTORY_MOVEMENT_ROLES])
    const locationId = await resolveMovementLocation(actor, input.locationId)
    const result = await recordMovementForActor(actor, {
      ...input,
      locationId,
      source: 'MANUAL',
    })
    revalidatePath('/dashboard/inventory')
    return { ...result, success: true as const }
  }, 'No se pudo registrar el movimiento de inventario.')
}

