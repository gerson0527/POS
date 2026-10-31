// Servicio de dominio de movimientos manuales de inventario (kardex).
// Recibe el actor explícito; lo usan la web y los canales externos (bot).
import { and, asc, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { AuditAction } from '@/lib/types'
import { assertActorRole, type ActorContext } from '@/lib/auth/actor'
import { logAudit } from '@/lib/audit/log'
import { getBogotaBusinessDate } from '@/lib/utils/business-date'

export const INVENTORY_MOVEMENT_ROLES = ['ADMIN', 'MANAGER'] as const

export type ManualMovementType = 'IN' | 'OUT' | 'ADJUSTMENT'
export type MovementSource = 'MANUAL' | 'ASSISTANT'

export interface InventoryMovementInput {
  productId: string
  locationId: string
  movementType: ManualMovementType
  /** IN/OUT: unidades positivas. ADJUSTMENT: delta con signo (+ suma, - resta). */
  quantity: number
  reason?: string | null
  notes?: string | null
  /** Misma clave = mismo movimiento: un reintento no lo aplica dos veces. */
  idempotencyKey?: string | null
  source?: MovementSource
}

export interface InventoryMovementResult {
  id: string
  productId: string
  locationId: string
  movementType: ManualMovementType
  delta: number
  previousQuantity: number | null
  newQuantity: number | null
  duplicated: boolean
}

const MAX_QUANTITY = 1_000_000

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** Delta con signo que se aplica al stock según el tipo de movimiento. */
export function movementDelta(movementType: ManualMovementType, quantity: number): number {
  if (!Number.isFinite(quantity)) throw new Error('La cantidad no es un número válido.')
  const q = round2(quantity)
  if (Math.abs(q) > MAX_QUANTITY) throw new Error('La cantidad excede el máximo permitido.')

  switch (movementType) {
    case 'IN':
      if (q <= 0) throw new Error('La entrada debe tener una cantidad mayor que cero.')
      return q
    case 'OUT':
      if (q <= 0) throw new Error('La salida debe tener una cantidad mayor que cero.')
      return -q
    case 'ADJUSTMENT':
      if (q === 0) throw new Error('El ajuste no puede ser cero.')
      return q
    default:
      throw new Error('Tipo de movimiento no soportado.')
  }
}

/**
 * Sede del movimiento cuando el canal no la envía: la del turno de caja abierto
 * del usuario hoy, o la única sede activa. Si hay varias, se exige elegirla.
 */
export async function resolveMovementLocation(
  actor: ActorContext,
  locationId?: string | null
): Promise<string> {
  if (locationId) return locationId

  const openSession = await db
    .select({ locationId: schema.cashierSession.locationId })
    .from(schema.cashierSession)
    .where(
      and(
        eq(schema.cashierSession.tenantId, actor.tenantId),
        eq(schema.cashierSession.userId, actor.userId),
        eq(schema.cashierSession.status, 'OPEN'),
        eq(schema.cashierSession.businessDate, getBogotaBusinessDate())
      )
    )
    .orderBy(desc(schema.cashierSession.openedAt))
    .limit(1)
  if (openSession[0]?.locationId) return openSession[0].locationId

  const active = await db
    .select({ id: schema.location.id })
    .from(schema.location)
    .where(and(eq(schema.location.tenantId, actor.tenantId), eq(schema.location.status, 'ACTIVE')))
    .orderBy(asc(schema.location.createdAt))
    .limit(2)
  if (active.length === 1) return active[0].id
  if (!active.length) throw new Error('La empresa no tiene sedes activas.')
  throw new Error('Seleccione la sede del movimiento de inventario.')
}

export async function recordInventoryMovement(
  actor: ActorContext,
  input: InventoryMovementInput
): Promise<InventoryMovementResult> {
  assertActorRole(actor, [...INVENTORY_MOVEMENT_ROLES])
  const { userId, tenantId } = actor

  if (!input.productId) throw new Error('Debe indicar el producto.')
  if (!input.locationId) throw new Error('Debe indicar la sede del movimiento.')
  const delta = movementDelta(input.movementType, input.quantity)
  const reason = input.reason?.trim() || null
  const notes = input.notes?.trim() || null
  if (input.movementType === 'ADJUSTMENT' && !reason && !notes) {
    throw new Error('El ajuste de inventario requiere un motivo.')
  }
  const idempotencyKey = input.idempotencyKey?.trim() || null

  const result = await db.transaction(async (tx) => {
    const productRows = await tx
      .select({ id: schema.product.id, name: schema.product.name })
      .from(schema.product)
      .where(and(eq(schema.product.id, input.productId), eq(schema.product.tenantId, tenantId)))
      .limit(1)
    const product = productRows[0]
    if (!product) throw new Error('Producto no encontrado.')

    const locationRows = await tx
      .select({ id: schema.location.id, status: schema.location.status })
      .from(schema.location)
      .where(and(eq(schema.location.id, input.locationId), eq(schema.location.tenantId, tenantId)))
      .limit(1)
    const location = locationRows[0]
    if (!location) throw new Error('Sede no encontrada.')
    if (location.status !== 'ACTIVE') throw new Error('La sede está inactiva.')

    // Se registra primero el movimiento: el índice único (tenantId, idempotencyKey)
    // hace que un reintento concurrente espere y luego no inserte nada.
    const movementId = `mov_${randomUUID()}`
    const inserted = await tx
      .insert(schema.inventoryMovement)
      .values({
        id: movementId,
        tenantId,
        locationId: input.locationId,
        productId: input.productId,
        movementType: input.movementType,
        quantity: delta.toString(),
        reference: input.source ?? 'MANUAL',
        notes,
        reason,
        idempotencyKey,
        userId,
      })
      .onConflictDoNothing()
      .returning({ id: schema.inventoryMovement.id })

    if (!inserted.length) {
      const existing = await tx
        .select()
        .from(schema.inventoryMovement)
        .where(
          and(
            eq(schema.inventoryMovement.tenantId, tenantId),
            eq(schema.inventoryMovement.idempotencyKey, idempotencyKey ?? '')
          )
        )
        .limit(1)
      const prior = existing[0]
      if (!prior) throw new Error('No se pudo registrar el movimiento de inventario.')
      return {
        id: prior.id,
        productId: prior.productId,
        locationId: prior.locationId,
        movementType: prior.movementType as ManualMovementType,
        delta: Number(prior.quantity),
        previousQuantity: null,
        newQuantity: null,
        duplicated: true,
      }
    }

    const findInventory = () =>
      tx
        .select()
        .from(schema.inventory)
        .where(
          and(
            eq(schema.inventory.tenantId, tenantId),
            eq(schema.inventory.locationId, input.locationId),
            eq(schema.inventory.productId, input.productId)
          )
        )
        .limit(1)
        .for('update')

    let inventory = (await findInventory())[0]
    if (!inventory) {
      if (delta < 0) {
        throw new Error(`No hay existencias de "${product.name}" en la sede seleccionada.`)
      }
      await tx
        .insert(schema.inventory)
        .values({
          id: `inv_${randomUUID()}`,
          tenantId,
          locationId: input.locationId,
          productId: input.productId,
          quantity: '0',
          available: '0',
        })
        .onConflictDoNothing()
      inventory = (await findInventory())[0]
      if (!inventory) throw new Error('No se pudo crear el registro de inventario.')
    }

    const previousQuantity = Number(inventory.quantity) || 0
    const newQuantity = round2(previousQuantity + delta)
    if (newQuantity < 0) {
      throw new Error(
        `Stock insuficiente para "${product.name}". Disponible: ${previousQuantity}, se intenta restar ${Math.abs(delta)}.`
      )
    }
    const reserved = Number(inventory.reserved) || 0

    await tx
      .update(schema.inventory)
      .set({
        quantity: newQuantity.toString(),
        available: round2(newQuantity - reserved).toString(),
        ...(input.movementType === 'ADJUSTMENT' ? { lastCountedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.inventory.id, inventory.id), eq(schema.inventory.tenantId, tenantId)))

    return {
      id: movementId,
      productId: input.productId,
      locationId: input.locationId,
      movementType: input.movementType,
      delta,
      previousQuantity,
      newQuantity,
      duplicated: false,
    }
  })

  if (!result.duplicated) {
    await logAudit(tenantId, userId, AuditAction.UPDATE, 'inventory', result.id, {
      productId: result.productId,
      locationId: result.locationId,
      movementType: result.movementType,
      delta: result.delta,
      previousQuantity: result.previousQuantity,
      newQuantity: result.newQuantity,
      reason,
      source: input.source ?? 'MANUAL',
      idempotencyKey,
    })
  }

  return result
}
