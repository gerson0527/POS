'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { AuditAction } from '@/lib/types'
import { and, eq, desc, gte, lte, ne, or, type SQL } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import {
  INTERNAL_NUMERATION,
  isInternalNumeration,
  normalizeNumerationInput,
  type NumerationInput,
} from '@/lib/fiscal/numeration'
import { getUserId, getTenantId, logAudit, requireRole } from './_shared'

export async function getNumerations() {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  return db
    .select()
    .from(schema.numeration)
    .where(eq(schema.numeration.tenantId, tenantId))
    .orderBy(desc(schema.numeration.createdAt))
}

async function assertNoOverlap(
  tenantId: string,
  prefix: string,
  startRange: number,
  endRange: number,
  excludeId?: string
) {
  const conditions: SQL[] = [
    eq(schema.numeration.tenantId, tenantId),
    eq(schema.numeration.prefix, prefix),
    lte(schema.numeration.startRange, endRange),
    gte(schema.numeration.endRange, startRange),
  ]
  if (excludeId) conditions.push(ne(schema.numeration.id, excludeId))

  const overlap = await db
    .select({ id: schema.numeration.id })
    .from(schema.numeration)
    .where(and(...conditions))
    .limit(1)

  if (overlap.length) {
    throw new Error(`Ya existe una numeración con el prefijo ${prefix} que se solapa con ese rango.`)
  }
}

async function assertNoActiveDuplicate(
  tenantId: string,
  documentType: string,
  status: string,
  excludeId?: string
) {
  if (status !== 'ACTIVE') return

  // La numeración interna REC (tickets POS) coexiste con rangos DIAN del mismo
  // documentType; no entra en la regla "solo una activa por tipo".
  const conditions: SQL[] = [
    eq(schema.numeration.tenantId, tenantId),
    eq(schema.numeration.documentType, documentType),
    eq(schema.numeration.status, 'ACTIVE'),
    // NOT (resolution=REC AND prefix=REC) ≡ resolution≠… OR prefix≠…
    or(
      ne(schema.numeration.resolution, INTERNAL_NUMERATION.resolution),
      ne(schema.numeration.prefix, INTERNAL_NUMERATION.prefix)
    )!,
  ]
  if (excludeId) conditions.push(ne(schema.numeration.id, excludeId))

  const active = await db
    .select({ id: schema.numeration.id })
    .from(schema.numeration)
    .where(and(...conditions))
    .limit(1)

  if (active.length) {
    throw new Error('Ya existe una numeración activa para ese tipo de documento. Desactive la anterior primero.')
  }
}

export async function createNumeration(input: NumerationInput) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER'])
  const tenantId = await getTenantId(userId)

  const values = normalizeNumerationInput(input)

  await assertNoOverlap(tenantId, values.prefix, values.startRange, values.endRange)
  await assertNoActiveDuplicate(tenantId, values.documentType, values.status)

  const id = `num_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  await db.insert(schema.numeration).values({
    id,
    tenantId,
    resolution: values.resolution,
    prefix: values.prefix,
    startRange: values.startRange,
    endRange: values.endRange,
    currentNumber: values.currentNumber,
    documentType: values.documentType,
    status: values.status,
  })

  await logAudit(tenantId, userId, AuditAction.CREATE, 'numeration', id, values)
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
  await requireRole(userId, ['ADMIN', 'MANAGER'])
  const tenantId = await getTenantId(userId)

  const rows = await db
    .select()
    .from(schema.numeration)
    .where(and(eq(schema.numeration.id, id), eq(schema.numeration.tenantId, tenantId)))
    .limit(1)
  const existing = rows[0]
  if (!existing) throw new Error('Numeración no encontrada.')

  const values = normalizeNumerationInput({
    resolution: input.resolution ?? existing.resolution,
    prefix: input.prefix ?? existing.prefix,
    startRange: input.startRange ?? existing.startRange,
    endRange: input.endRange ?? existing.endRange,
    currentNumber: input.currentNumber ?? existing.currentNumber,
    documentType: input.documentType ?? existing.documentType,
    status: input.status ?? existing.status,
  })

  if (values.currentNumber < existing.currentNumber) {
    throw new Error('No se puede reducir el consecutivo actual: ya se emitieron documentos con números mayores.')
  }

  if (isInternalNumeration(existing)) {
    if (
      values.resolution !== existing.resolution ||
      values.prefix !== existing.prefix ||
      values.documentType !== existing.documentType
    ) {
      throw new Error('La numeración interna del POS no se puede renombrar ni cambiar de tipo.')
    }
    if (values.status !== 'ACTIVE') {
      throw new Error(
        'La numeración interna del POS es obligatoria para emitir tickets y no se puede desactivar.'
      )
    }
  }

  await assertNoOverlap(tenantId, values.prefix, values.startRange, values.endRange, id)
  if (!isInternalNumeration(values)) {
    await assertNoActiveDuplicate(tenantId, values.documentType, values.status, id)
  }

  await db
    .update(schema.numeration)
    .set({
      resolution: values.resolution,
      prefix: values.prefix,
      startRange: values.startRange,
      endRange: values.endRange,
      currentNumber: values.currentNumber,
      documentType: values.documentType,
      status: values.status,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.numeration.id, id), eq(schema.numeration.tenantId, tenantId)))

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'numeration', id, values)
  revalidatePath('/dashboard/settings')
  return { success: true }
}

export async function deleteNumeration(id: string) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER'])
  const tenantId = await getTenantId(userId)

  const rows = await db
    .select()
    .from(schema.numeration)
    .where(and(eq(schema.numeration.id, id), eq(schema.numeration.tenantId, tenantId)))
    .limit(1)
  const existing = rows[0]
  if (!existing) throw new Error('Numeración no encontrada.')

  if (isInternalNumeration(existing)) {
    throw new Error('La numeración interna del POS es obligatoria y no se puede eliminar.')
  }
  if (existing.currentNumber >= existing.startRange) {
    throw new Error(
      `La numeración ${existing.prefix} ya emitió consecutivos. Desactívela en lugar de eliminarla para conservar el historial.`
    )
  }

  await db
    .delete(schema.numeration)
    .where(and(eq(schema.numeration.id, id), eq(schema.numeration.tenantId, tenantId)))

  await logAudit(tenantId, userId, AuditAction.DELETE, 'numeration', id, {})
  revalidatePath('/dashboard/settings')
  return { success: true }
}
