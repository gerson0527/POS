'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { AuditAction } from '@/lib/types'
import { and, eq, asc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUserId, getTenantId, logAudit } from './_shared'
import { slugify } from '@/lib/utils/slugify'
export async function getProductCategories(includeInactive = true) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const rows = await db
    .select()
    .from(schema.productCategory)
    .where(eq(schema.productCategory.tenantId, tenantId))
    .orderBy(asc(schema.productCategory.name))

  return includeInactive ? rows : rows.filter((c) => c.status === 'ACTIVE')
}

export async function createProductCategory(input: {
  name: string
  description?: string
  color?: string
  icon?: string
}) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const name = input.name.trim()
  if (!name) throw new Error('El nombre de la categoría es obligatorio')

  const baseSlug = slugify(name)
  let slug = baseSlug
  let counter = 1
  while (
    await db
      .select({ id: schema.productCategory.id })
      .from(schema.productCategory)
      .where(and(eq(schema.productCategory.tenantId, tenantId), eq(schema.productCategory.slug, slug)))
      .limit(1)
  ) {
    counter++
    slug = `${baseSlug}-${counter}`
    if (counter > 100) {
      throw new Error('Demasiadas categorías con el mismo nombre')
    }
  }

  const id = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

  await db.insert(schema.productCategory).values({
    id,
    tenantId,
    name,
    slug,
    description: input.description?.trim() || null,
    color: input.color || '#FF6A00',
    icon: input.icon || null,
  })

  await logAudit(tenantId, userId, AuditAction.CREATE, 'product_category', id, { name, slug })

  revalidatePath('/dashboard/categories')
  revalidatePath('/dashboard/inventory')
  return { id, name, slug, success: true }
}

export async function updateProductCategory(input: {
  id: string
  name?: string
  description?: string
  color?: string
  icon?: string
}) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const update: any = { updatedAt: new Date() }
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) throw new Error('El nombre de la categoría es obligatorio')
    update.name = name
  }
  if (input.description !== undefined) update.description = input.description?.trim() || null
  if (input.color !== undefined) update.color = input.color
  if (input.icon !== undefined) update.icon = input.icon || null

  if (Object.keys(update).length === 1) return { success: true }

  await db
    .update(schema.productCategory)
    .set(update)
    .where(
      and(
        eq(schema.productCategory.id, input.id),
        eq(schema.productCategory.tenantId, tenantId)
      )
    )

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'product_category', input.id, update)

  revalidatePath('/dashboard/categories')
  return { success: true }
}

export async function toggleProductCategoryStatus(id: string) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const row = await db
    .select()
    .from(schema.productCategory)
    .where(and(eq(schema.productCategory.id, id), eq(schema.productCategory.tenantId, tenantId)))
    .limit(1)

  if (!row.length) throw new Error('Categoría no encontrada')

  const next = row[0].status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
  await db
    .update(schema.productCategory)
    .set({ status: next, updatedAt: new Date() })
    .where(eq(schema.productCategory.id, id))

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'product_category', id, { status: next })

  revalidatePath('/dashboard/categories')
  revalidatePath('/dashboard/inventory')
  return { id, status: next, success: true }
}

export async function deleteProductCategory(id: string, reassignTo?: string) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const usage = await db
    .select({ id: schema.product.id })
    .from(schema.product)
    .where(and(eq(schema.product.tenantId, tenantId), eq(schema.product.category, id)))
    .limit(1)

  if (usage.length && !reassignTo) {
    throw new Error(
      'La categoría tiene productos asociados. Especifica reassignTo para moverlos a otra categoría.'
    )
  }

  if (reassignTo) {
    await db
      .update(schema.product)
      .set({ category: reassignTo, updatedAt: new Date() })
      .where(and(eq(schema.product.tenantId, tenantId), eq(schema.product.category, id)))
  } else {
    await db
      .update(schema.product)
      .set({ category: null, updatedAt: new Date() })
      .where(and(eq(schema.product.tenantId, tenantId), eq(schema.product.category, id)))
  }

  await db
    .delete(schema.productCategory)
    .where(and(eq(schema.productCategory.id, id), eq(schema.productCategory.tenantId, tenantId)))

  await logAudit(tenantId, userId, AuditAction.DELETE, 'product_category', id, { reassignTo })

  revalidatePath('/dashboard/categories')
  revalidatePath('/dashboard/inventory')
  return { id, success: true }
}

