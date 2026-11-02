'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { AuditAction } from '@/lib/types'
import { and, eq, asc, isNull, or } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUserId, getTenantId, logAudit, requireRole } from './_shared'
import { slugify } from '@/lib/utils/slugify'
import {
  DEFAULT_PRODUCT_CATEGORY_COLOR,
  DEFAULT_PRODUCT_CATEGORY_DESCRIPTION,
  DEFAULT_PRODUCT_CATEGORY_NAME,
  DEFAULT_PRODUCT_CATEGORY_SLUG,
  isDefaultProductCategory,
} from '@/lib/catalogs/product-categories'

/**
 * Garantiza que el tenant tenga la categoría predeterminada "Sin categoría".
 * Se crea la primera vez que se consultan las categorías (sin necesidad de
 * migración) y se reactiva si alguien la había desactivado.
 */
async function ensureDefaultProductCategory(tenantId: string) {
  const existing = await db
    .select()
    .from(schema.productCategory)
    .where(
      and(
        eq(schema.productCategory.tenantId, tenantId),
        eq(schema.productCategory.slug, DEFAULT_PRODUCT_CATEGORY_SLUG)
      )
    )
    .limit(1)

  const current = existing[0]
  if (current) {
    if (current.status !== 'ACTIVE') {
      await db
        .update(schema.productCategory)
        .set({ status: 'ACTIVE', updatedAt: new Date() })
        .where(eq(schema.productCategory.id, current.id))
      return { ...current, status: 'ACTIVE' }
    }
    return current
  }

  const id = `cat_default_${tenantId}`
  try {
    await db.insert(schema.productCategory).values({
      id,
      tenantId,
      name: DEFAULT_PRODUCT_CATEGORY_NAME,
      slug: DEFAULT_PRODUCT_CATEGORY_SLUG,
      description: DEFAULT_PRODUCT_CATEGORY_DESCRIPTION,
      color: DEFAULT_PRODUCT_CATEGORY_COLOR,
      status: 'ACTIVE',
    })
    const created = await db
      .select()
      .from(schema.productCategory)
      .where(eq(schema.productCategory.id, id))
      .limit(1)
    if (!created[0]) throw new Error('No se pudo crear la categoría predeterminada')
    return created[0]
  } catch {
    // Otra petición pudo crearla al mismo tiempo: se reutiliza la existente.
    const rows = await db
      .select()
      .from(schema.productCategory)
      .where(
        and(
          eq(schema.productCategory.tenantId, tenantId),
          eq(schema.productCategory.slug, DEFAULT_PRODUCT_CATEGORY_SLUG)
        )
      )
      .limit(1)
    if (!rows[0]) throw new Error('No se pudo crear la categoría predeterminada')
    return rows[0]
  }
}

export async function getProductCategories(includeInactive = true) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  await ensureDefaultProductCategory(tenantId)

  const rows = await db
    .select()
    .from(schema.productCategory)
    .where(eq(schema.productCategory.tenantId, tenantId))
    .orderBy(asc(schema.productCategory.name))

  // "Sin categoría" siempre primero para que sea fácil de elegir.
  rows.sort((a, b) => {
    const aDefault = isDefaultProductCategory(a.slug) ? 0 : 1
    const bDefault = isDefaultProductCategory(b.slug) ? 0 : 1
    return aDefault - bDefault || a.name.localeCompare(b.name, 'es')
  })

  return includeInactive ? rows : rows.filter((c) => c.status === 'ACTIVE')
}

export async function createProductCategory(input: {
  name: string
  description?: string
  color?: string
  icon?: string
}) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER'])
  const tenantId = await getTenantId(userId)

  const name = input.name.trim()
  if (!name) throw new Error('El nombre de la categoría es obligatorio')

  const baseSlug = slugify(name) || 'categoria'
  // Evitar el bug de truthy en arrays vacíos: se consultan los slugs una sola vez.
  const existingSlugs = await db
    .select({ slug: schema.productCategory.slug })
    .from(schema.productCategory)
    .where(eq(schema.productCategory.tenantId, tenantId))
  const taken = new Set(existingSlugs.map((r) => r.slug))
  let slug = baseSlug
  let counter = 1
  while (taken.has(slug)) {
    counter++
    if (counter > 100) throw new Error('Demasiadas categorías con el mismo nombre')
    slug = `${baseSlug}-${counter}`
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
  await requireRole(userId, ['ADMIN', 'MANAGER'])
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
  await requireRole(userId, ['ADMIN', 'MANAGER'])
  const tenantId = await getTenantId(userId)

  const row = await db
    .select()
    .from(schema.productCategory)
    .where(and(eq(schema.productCategory.id, id), eq(schema.productCategory.tenantId, tenantId)))
    .limit(1)

  if (!row.length) throw new Error('Categoría no encontrada')

  if (isDefaultProductCategory(row[0].slug)) {
    throw new Error('La categoría "Sin categoría" es la predeterminada y debe permanecer activa.')
  }

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
  await requireRole(userId, ['ADMIN', 'MANAGER'])
  const tenantId = await getTenantId(userId)

  const row = await db
    .select()
    .from(schema.productCategory)
    .where(and(eq(schema.productCategory.id, id), eq(schema.productCategory.tenantId, tenantId)))
    .limit(1)
  if (!row.length) throw new Error('Categoría no encontrada')

  if (isDefaultProductCategory(row[0].slug)) {
    throw new Error('La categoría "Sin categoría" es la predeterminada y no se puede eliminar.')
  }

  // Reasignar por categoryId (y compatibilidad con datos antiguos guardados por nombre).
  const usage = await db
    .select({ id: schema.product.id })
    .from(schema.product)
    .where(
      and(
        eq(schema.product.tenantId, tenantId),
        or(eq(schema.product.categoryId, id), and(isNull(schema.product.categoryId), eq(schema.product.category, row[0].name)))
      )
    )
    .limit(1)

  if (usage.length && !reassignTo) {
    throw new Error(
      'La categoría tiene productos asociados. Especifica reassignTo para moverlos a otra categoría.'
    )
  }

  const targetId = reassignTo || (await ensureDefaultProductCategory(tenantId)).id
  const target = await db
    .select()
    .from(schema.productCategory)
    .where(and(eq(schema.productCategory.id, targetId), eq(schema.productCategory.tenantId, tenantId)))
    .limit(1)
  if (!target.length) throw new Error('Categoría de reasignación no encontrada')

  await db
    .update(schema.product)
    .set({
      categoryId: target[0].id,
      category: target[0].name,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.product.tenantId, tenantId),
        or(eq(schema.product.categoryId, id), and(isNull(schema.product.categoryId), eq(schema.product.category, row[0].name)))
      )
    )

  await db
    .delete(schema.productCategory)
    .where(and(eq(schema.productCategory.id, id), eq(schema.productCategory.tenantId, tenantId)))

  await logAudit(tenantId, userId, AuditAction.DELETE, 'product_category', id, { reassignTo })

  revalidatePath('/dashboard/categories')
  revalidatePath('/dashboard/inventory')
  return { id, success: true }
}

