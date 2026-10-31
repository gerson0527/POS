import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'

export interface StockRow {
  locationId: string
  locationName: string
  quantity: number
  available: number
}

/** Existencias del producto en todas las sedes del tenant (o una sede). */
export async function getProductStock(
  tenantId: string,
  productId: string,
  locationId?: string | null
): Promise<StockRow[]> {
  const conditions = [
    eq(schema.inventory.tenantId, tenantId),
    eq(schema.inventory.productId, productId),
  ]
  if (locationId) conditions.push(eq(schema.inventory.locationId, locationId))

  const rows = await db
    .select({
      locationId: schema.inventory.locationId,
      locationName: schema.location.name,
      quantity: schema.inventory.quantity,
      available: schema.inventory.available,
    })
    .from(schema.inventory)
    .innerJoin(
      schema.location,
      and(
        eq(schema.location.id, schema.inventory.locationId),
        eq(schema.location.tenantId, tenantId)
      )
    )
    .where(and(...conditions))
    .orderBy(sql`${schema.location.name} ASC`)

  return rows.map((r) => ({
    locationId: r.locationId,
    locationName: r.locationName,
    quantity: Number(r.quantity) || 0,
    available: Number(r.available) || 0,
  }))
}
