import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { ActorContext } from '@/lib/auth/actor'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const shouldRun = process.env.RUN_DB_TESTS === '1' && Boolean(testDatabaseUrl)
const describeDb = shouldRun ? describe : describe.skip

let db: typeof import('@/lib/db').db
let pool: typeof import('@/lib/db').pool
let schema: typeof import('@/lib/db/schema')
let service: typeof import('@/lib/inventory/service')

const createdTenantIds: string[] = []

async function createFixture(quantity = '10.00') {
  const id = randomUUID().replace(/-/g, '').slice(0, 16)
  const tenantId = `test_tenant_${id}`
  const locationId = `test_location_${id}`
  const productId = `test_product_${id}`

  await db.insert(schema.tenant).values({
    id: tenantId,
    name: 'Test Tenant',
    nit: `TEST-${id}`,
    legalName: 'Test Tenant SAS',
    status: 'ACTIVE',
    factusEnvironment: 'sandbox',
    updatedAt: new Date(),
  })
  createdTenantIds.push(tenantId)

  await db.insert(schema.location).values({
    id: locationId,
    tenantId,
    name: 'Sede Test',
    code: `L-${id}`,
    status: 'ACTIVE',
    updatedAt: new Date(),
  })
  await db.insert(schema.product).values({
    id: productId,
    tenantId,
    sku: `SKU-${id}`,
    name: 'Producto Test',
    unitPrice: '1000.0000',
    ivaRate: '0.00',
    status: 'ACTIVE',
    updatedAt: new Date(),
  })
  await db.insert(schema.inventory).values({
    id: `test_inv_${id}`,
    tenantId,
    locationId,
    productId,
    quantity,
    available: quantity,
    updatedAt: new Date(),
  })

  const actor: ActorContext = { userId: `test_user_${id}`, tenantId, role: 'MANAGER' }
  return { tenantId, locationId, productId, actor }
}

async function stockOf(tenantId: string, locationId: string, productId: string) {
  const rows = await db
    .select()
    .from(schema.inventory)
    .where(
      and(
        eq(schema.inventory.tenantId, tenantId),
        eq(schema.inventory.locationId, locationId),
        eq(schema.inventory.productId, productId)
      )
    )
  return Number(rows[0]?.quantity)
}

async function cleanupTenant(tenantId: string) {
  await db.delete(schema.inventoryMovement).where(eq(schema.inventoryMovement.tenantId, tenantId))
  await db.delete(schema.inventory).where(eq(schema.inventory.tenantId, tenantId))
  await db.delete(schema.auditLog).where(eq(schema.auditLog.tenantId, tenantId))
  await db.delete(schema.product).where(eq(schema.product.tenantId, tenantId))
  await db.delete(schema.location).where(eq(schema.location.tenantId, tenantId))
  await db.delete(schema.tenant).where(eq(schema.tenant.id, tenantId))
}

describeDb('inventory movement service (integration)', () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required')
    process.env.DATABASE_URL = testDatabaseUrl
    const dbModule = await import('@/lib/db')
    db = dbModule.db
    pool = dbModule.pool
    schema = await import('@/lib/db/schema')
    service = await import('@/lib/inventory/service')
  })

  afterEach(async () => {
    for (const tenantId of createdTenantIds.splice(0)) await cleanupTenant(tenantId)
  })

  afterAll(async () => {
    await pool?.end()
  })

  it('IN y OUT actualizan el stock con el signo correcto', async () => {
    const f = await createFixture('10.00')
    const base = { productId: f.productId, locationId: f.locationId }

    const entry = await service.recordInventoryMovement(f.actor, { ...base, movementType: 'IN', quantity: 5 })
    expect(entry.newQuantity).toBe(15)

    const exit = await service.recordInventoryMovement(f.actor, { ...base, movementType: 'OUT', quantity: 4 })
    expect(exit.newQuantity).toBe(11)
    expect(await stockOf(f.tenantId, f.locationId, f.productId)).toBe(11)
  })

  it('no deja el stock negativo y no registra el movimiento', async () => {
    const f = await createFixture('2.00')
    await expect(
      service.recordInventoryMovement(f.actor, {
        productId: f.productId,
        locationId: f.locationId,
        movementType: 'OUT',
        quantity: 3,
      })
    ).rejects.toThrow(/Stock insuficiente/)

    expect(await stockOf(f.tenantId, f.locationId, f.productId)).toBe(2)
    const movements = await db
      .select()
      .from(schema.inventoryMovement)
      .where(eq(schema.inventoryMovement.tenantId, f.tenantId))
    expect(movements).toHaveLength(0)
  })

  it('la misma idempotencyKey no aplica el movimiento dos veces (incluso concurrente)', async () => {
    const f = await createFixture('10.00')
    const input = {
      productId: f.productId,
      locationId: f.locationId,
      movementType: 'IN' as const,
      quantity: 3,
      idempotencyKey: `key_${randomUUID()}`,
    }

    const results = await Promise.all([
      service.recordInventoryMovement(f.actor, input),
      service.recordInventoryMovement(f.actor, input),
    ])
    expect(results.filter((r) => r.duplicated)).toHaveLength(1)

    const retry = await service.recordInventoryMovement(f.actor, input)
    expect(retry.duplicated).toBe(true)
    expect(await stockOf(f.tenantId, f.locationId, f.productId)).toBe(13)
  })

  it('no permite mover productos ni sedes de otro tenant', async () => {
    const a = await createFixture()
    const b = await createFixture()

    await expect(
      service.recordInventoryMovement(a.actor, {
        productId: b.productId,
        locationId: a.locationId,
        movementType: 'IN',
        quantity: 1,
      })
    ).rejects.toThrow(/Producto no encontrado/)

    await expect(
      service.recordInventoryMovement(a.actor, {
        productId: a.productId,
        locationId: b.locationId,
        movementType: 'IN',
        quantity: 1,
      })
    ).rejects.toThrow(/Sede no encontrada/)
  })

  it('el ajuste exige motivo y respeta el signo', async () => {
    const f = await createFixture('10.00')
    const base = { productId: f.productId, locationId: f.locationId, movementType: 'ADJUSTMENT' as const }

    await expect(service.recordInventoryMovement(f.actor, { ...base, quantity: -2 })).rejects.toThrow(/motivo/)

    const adj = await service.recordInventoryMovement(f.actor, { ...base, quantity: -2, reason: 'Conteo físico' })
    expect(adj.newQuantity).toBe(8)
  })

  it('un CASHIER no puede registrar movimientos manuales', async () => {
    const f = await createFixture()
    await expect(
      service.recordInventoryMovement(
        { ...f.actor, role: 'CASHIER' },
        { productId: f.productId, locationId: f.locationId, movementType: 'IN', quantity: 1 }
      )
    ).rejects.toThrow(/FORBIDDEN/)
  })
})
