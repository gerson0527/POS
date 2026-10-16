'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { AuditAction } from '@/lib/types'
import { and, eq, desc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUserId, getTenantId, logAudit } from './_shared'
export async function getNumerations() {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  return db
    .select()
    .from(schema.numeration)
    .where(eq(schema.numeration.tenantId, tenantId))
    .orderBy(desc(schema.numeration.createdAt))
}

export async function createNumeration(input: {
  resolution: string
  prefix: string
  startRange: number
  endRange: number
  currentNumber?: number
  documentType: string
}) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const id = `num_${Date.now()}`

  await db.insert(schema.numeration).values({
    id,
    tenantId,
    resolution: input.resolution,
    prefix: input.prefix.toUpperCase(),
    startRange: Number(input.startRange),
    endRange: Number(input.endRange),
    currentNumber: Number(input.currentNumber ?? input.startRange),
    documentType: input.documentType,
    status: 'ACTIVE',
  })

  await logAudit(tenantId, userId, AuditAction.CREATE, 'numeration', id, input)
  revalidatePath('/dashboard/settings')
  return { id, success: true }
}

export async function updateNumeration(
  id: string,
  input: {
    resolution?: string
    prefix?: string
    startRange?: number
    endRange?: number
    currentNumber?: number
    documentType?: string
    status?: string
  }
) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  await db
    .update(schema.numeration)
    .set({
      ...(input.resolution && { resolution: input.resolution }),
      ...(input.prefix && { prefix: input.prefix.toUpperCase() }),
      ...(input.startRange !== undefined && { startRange: Number(input.startRange) }),
      ...(input.endRange !== undefined && { endRange: Number(input.endRange) }),
      ...(input.currentNumber !== undefined && { currentNumber: Number(input.currentNumber) }),
      ...(input.documentType && { documentType: input.documentType }),
      ...(input.status && { status: input.status }),
    })
    .where(and(eq(schema.numeration.id, id), eq(schema.numeration.tenantId, tenantId)))

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'numeration', id, input)
  revalidatePath('/dashboard/settings')
  return { success: true }
}

export async function deleteNumeration(id: string) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  await db
    .delete(schema.numeration)
    .where(and(eq(schema.numeration.id, id), eq(schema.numeration.tenantId, tenantId)))

  await logAudit(tenantId, userId, AuditAction.DELETE, 'numeration', id, {})
  revalidatePath('/dashboard/settings')
  return { success: true }
}

