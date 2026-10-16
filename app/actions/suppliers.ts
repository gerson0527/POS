'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { AuditAction } from '@/lib/types'
import { and, eq, desc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUserId, getTenantId, logAudit } from './_shared'
export async function getSuppliersList() {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  return db
    .select()
    .from(schema.supplier)
    .where(eq(schema.supplier.tenantId, tenantId))
    .orderBy(desc(schema.supplier.createdAt))
}

export async function createSupplier(input: { name: string; nit?: string; email?: string; phone?: string; address?: string }) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const cleanNit = input.nit && input.nit.trim() ? input.nit.trim() : null

  if (cleanNit) {
    const existing = await db
      .select()
      .from(schema.supplier)
      .where(and(eq(schema.supplier.tenantId, tenantId), eq(schema.supplier.nit, cleanNit)))
      .limit(1)

    if (existing.length > 0) {
      throw new Error(`Ya existe un proveedor registrado con el NIT ${cleanNit}.`)
    }
  }

  const id = `supp_${Date.now()}`

  await db.insert(schema.supplier).values({
    id,
    tenantId,
    name: input.name,
    nit: cleanNit,
    email: input.email || null,
    phone: input.phone || null,
    address: input.address || null,
    status: 'ACTIVE',
  })

  await logAudit(tenantId, userId, AuditAction.CREATE, 'supplier', id, input)
  revalidatePath('/dashboard/inventory')
  return { id, success: true }
}

export async function deleteSupplier(id: string) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  await db
    .delete(schema.supplier)
    .where(and(eq(schema.supplier.id, id), eq(schema.supplier.tenantId, tenantId)))

  await logAudit(tenantId, userId, AuditAction.DELETE, 'supplier', id, {})
  revalidatePath('/dashboard/inventory')
  return { success: true }
}

