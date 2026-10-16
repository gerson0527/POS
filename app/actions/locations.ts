'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import {
  CreateLocationDTO,
  AuditAction
} from '@/lib/types'
import { and, eq, asc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUserId, getTenantId, logAudit } from './_shared'
export async function createLocation(input: CreateLocationDTO) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const id = `loc_${Date.now()}`

  await db.insert(schema.location).values({
    id,
    tenantId,
    name: input.name,
    code: input.code,
    address: input.address,
    phone: input.phone
  })

  await logAudit(tenantId, userId, AuditAction.CREATE, 'location', id, input)

  revalidatePath('/dashboard/locations')
  revalidatePath('/dashboard/settings')
  return { id, success: true }
}

export async function getAllLocations() {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  return db
    .select()
    .from(schema.location)
    .where(eq(schema.location.tenantId, tenantId))
    .orderBy(asc(schema.location.name))
}

export async function updateLocation(
  id: string,
  input: { name?: string; code?: string; address?: string; phone?: string; status?: string }
) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  await db
    .update(schema.location)
    .set({
      ...(input.name && { name: input.name }),
      ...(input.code && { code: input.code }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.status && { status: input.status }),
    })
    .where(and(eq(schema.location.id, id), eq(schema.location.tenantId, tenantId)))

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'location', id, input)
  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard/locations')
  return { success: true }
}

export async function deleteLocation(id: string) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  await db
    .delete(schema.location)
    .where(and(eq(schema.location.id, id), eq(schema.location.tenantId, tenantId)))

  await logAudit(tenantId, userId, AuditAction.DELETE, 'location', id, {})
  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard/locations')
  return { success: true }
}

