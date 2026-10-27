'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import {
  CreateProductDTO,
  AuditAction,
  EventType
} from '@/lib/types'
import { and, eq, asc, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUserId, getTenantId, logAudit, publishEvent, requireRole } from './_shared'
import { ALL_ROLES } from '@/lib/auth/permissions'
function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function exportProductsToCSV(): Promise<{ csv: string; filename: string }> {
  const userId = await getUserId()
  await requireRole(userId, ALL_ROLES)
  const tenantId = await getTenantId(userId)

  const products = await db
    .select({
      sku: schema.product.sku,
      name: schema.product.name,
      description: schema.product.description,
      barcode: schema.product.barcode,
      category: schema.product.category,
      unitPrice: schema.product.unitPrice,
      cost: schema.product.cost,
      ivaRate: schema.product.ivaRate,
      status: schema.product.status,
      quantity: schema.inventory.quantity,
    })
    .from(schema.product)
    .leftJoin(schema.inventory, eq(schema.product.id, schema.inventory.productId))
    .where(eq(schema.product.tenantId, tenantId))
    .orderBy(asc(schema.product.name))

  const headers = [
    'SKU',
    'nombre',
    'descripcion',
    'codigo_barras',
    'categoria',
    'precio_venta',
    'costo',
    'tasa_iva',
    'stock',
    'estado',
  ]

  const rows = products.map((p) => [
    p.sku || '',
    p.name || '',
    p.description || '',
    p.barcode || '',
    p.category || '',
    String(p.unitPrice ?? 0),
    String(p.cost ?? 0),
    String(p.ivaRate ?? 19),
    String(p.quantity ?? 0),
    p.status || 'ACTIVE',
  ])

  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ].join('\n')

  const stamp = new Date().toISOString().split('T')[0]
  return { csv: '\uFEFF' + csv, filename: `productos_${tenantId}_${stamp}.csv` }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += c
      }
    } else {
      if (c === ',') {
        result.push(cur.trim())
        cur = ''
      } else if (c === '"') {
        inQuotes = true
      } else {
        cur += c
      }
    }
  }
  result.push(cur.trim())
  return result
}

function parseCsv(content: string): string[][] {
  const cleaned = content.replace(/^\uFEFF/, '')
  return cleaned
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map(parseCsvLine)
}

export async function importProductsFromCSV(input: {
  csvContent: string
  mode: 'create' | 'upsert'
}): Promise<{ inserted: number; updated: number; errors: string[] }> {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER'])
  const tenantId = await getTenantId(userId)

  const errors: string[] = []
  let inserted = 0
  let updated = 0

  const rows = parseCsv(input.csvContent)
  if (rows.length < 2) {
    return { inserted: 0, updated: 0, errors: ['El archivo no contiene datos. Incluye al menos una fila después del encabezado.'] }
  }

  const header = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, '_'))
  const idx = (key: string) => header.indexOf(key)

  const skuIdx = idx('sku')
  const nameIdx = idx('nombre')
  const descIdx = idx('descripcion')
  const barcodeIdx = idx('codigo_barras')
  const categoryIdx = idx('categoria')
  const unitPriceIdx = idx('precio_venta')
  const costIdx = idx('costo')
  const ivaIdx = idx('tasa_iva')
  const stockIdx = idx('stock')
  const statusIdx = idx('estado')

  if (nameIdx === -1 || unitPriceIdx === -1) {
    return { inserted: 0, updated: 0, errors: ['Faltan columnas obligatorias: nombre y precio_venta.'] }
  }

  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]
    try {
      const name = cells[nameIdx] || ''
      if (!name) {
        errors.push(`Fila ${i + 1}: nombre vacío, se omitió.`)
        continue
      }
      const sku = (skuIdx >= 0 ? cells[skuIdx] : '') || `SKU-${Date.now().toString().slice(-6)}-${i}`
      const description = descIdx >= 0 ? cells[descIdx] : ''
      const barcode = barcodeIdx >= 0 ? cells[barcodeIdx] : ''
      const category = categoryIdx >= 0 ? cells[categoryIdx] : ''
      const unitPrice = parseFloat(String(cells[unitPriceIdx]).replace(/[^\d.-]/g, '')) || 0
      const cost = costIdx >= 0 ? parseFloat(String(cells[costIdx]).replace(/[^\d.-]/g, '')) || 0 : 0
      const ivaRate = ivaIdx >= 0 ? parseFloat(String(cells[ivaIdx]).replace(/[^\d.-]/g, '')) || 19 : 19
      const stock = stockIdx >= 0 ? parseFloat(String(cells[stockIdx]).replace(/[^\d.-]/g, '')) || 0 : 0
      const status = statusIdx >= 0 && cells[statusIdx] ? cells[statusIdx] : 'ACTIVE'

      // buscar por SKU
      const existing = await db
        .select()
        .from(schema.product)
        .where(and(eq(schema.product.tenantId, tenantId), eq(schema.product.sku, sku)))
        .limit(1)

      if (existing.length) {
        if (input.mode !== 'upsert') {
          errors.push(`Fila ${i + 1}: SKU "${sku}" ya existe (omitido).`)
          continue
        }
        await db
          .update(schema.product)
          .set({
            name,
            description,
            barcode,
            category,
            unitPrice: String(unitPrice),
            cost: String(cost),
            ivaRate: String(ivaRate),
            status,
            updatedAt: new Date(),
          })
          .where(eq(schema.product.id, existing[0].id))

        // actualizar stock en inventario si se envió
        if (stockIdx >= 0) {
          const inv = await db
            .select()
            .from(schema.inventory)
            .where(eq(schema.inventory.productId, existing[0].id))
            .limit(1)
          if (inv.length) {
            await db
              .update(schema.inventory)
              .set({ quantity: String(stock), available: String(stock), updatedAt: new Date() })
              .where(eq(schema.inventory.id, inv[0].id))
          }
        }
        updated++
      } else {
        const newId = `prod_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
        await db.insert(schema.product).values({
          id: newId,
          tenantId,
          sku,
          name,
          description: description || null,
          barcode: barcode || null,
          category: category || null,
          unitPrice: String(unitPrice),
          cost: String(cost),
          ivaRate: String(ivaRate),
          status,
        })
        if (stock > 0) {
          await db.insert(schema.inventory).values({
            id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            tenantId,
            locationId: 'loc_default',
            productId: newId,
            quantity: String(stock),
            available: String(stock),
          })
        }
        inserted++
      }
    } catch (e: any) {
      errors.push(`Fila ${i + 1}: ${e.message || 'error desconocido'}`)
    }
  }

  await logAudit(tenantId, userId, AuditAction.CREATE, 'product_import', 'csv', {
    inserted,
    updated,
    errorCount: errors.length,
  })

  revalidatePath('/dashboard/inventory')
  return { inserted, updated, errors }
}

export async function getImportTemplateCSV(): Promise<string> {
  const sample = [
    'SKU,nombre,descripcion,codigo_barras,categoria,precio_venta,costo,tasa_iva,stock,estado',
    'SKU-001,Teclado Mecánico RGB,Switches Cherry MX Red,770123450001,Tecnología,250000,150000,19,25,ACTIVE',
    'SKU-002,Pasta Dental 100ml,Marca Colgate,770123450002,Aseo Personal,8500,4500,19,100,ACTIVE',
    'SKU-003,Cuaderno Universitario,100 hojas cuadriculado,770123450003,Papelería,6500,3200,5,80,ACTIVE',
    'SKU-004,Café Águila Roja 500g,Presentación 500g,770123450004,Despensa,12500,7800,5,50,ACTIVE',
  ].join('\n')
  return '\uFEFF' + sample
}

// PRODUCT ACTIONS
export async function createProduct(input: CreateProductDTO & { initialStock?: number }) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER'])
  const tenantId = await getTenantId(userId)

  const cleanSku = input.sku ? input.sku.trim() : `SKU-${Date.now().toString().slice(-6)}`

  const existingSku = await db
    .select()
    .from(schema.product)
    .where(and(eq(schema.product.tenantId, tenantId), eq(schema.product.sku, cleanSku)))
    .limit(1)

  if (existingSku.length > 0) {
    throw new Error(`Ya existe un producto registrado con el SKU "${cleanSku}".`)
  }

  const id = `prod_${Date.now()}`

  const unitPriceNum = Number(input.unitPrice || 0)
  const costNum = input.cost ? Number(input.cost) : 0
  const calculatedMargin = input.margin !== undefined
    ? Number(input.margin)
    : (unitPriceNum > 0 && costNum > 0 ? Number((((unitPriceNum - costNum) / unitPriceNum) * 100).toFixed(2)) : 0)

  await db.insert(schema.product).values({
    id,
    tenantId,
    sku: cleanSku,
    barcode: input.barcode || null,
    categoryId: input.categoryId || null,
    category: input.category || 'General',
    name: input.name,
    description: input.description || null,
    unitPrice: String(input.unitPrice),
    cost: input.cost !== undefined && input.cost !== null ? String(input.cost) : null,
    margin: String(calculatedMargin),
    ivaRate: String(input.ivaRate ?? 19),
    taxTreatment: input.taxTreatment || 'TAXED',
    status: 'ACTIVE',
  })

  if (input.initialStock && input.initialStock > 0) {
    const locations = await db.select().from(schema.location).where(eq(schema.location.tenantId, tenantId)).limit(1)
    const locationId = locations[0]?.id || 'loc_default'
    await db.insert(schema.inventory).values({
      id: `inv_${Date.now()}`,
      tenantId,
      locationId,
      productId: id,
      quantity: String(input.initialStock),
      available: String(input.initialStock),
    })
  }

  await logAudit(tenantId, userId, AuditAction.CREATE, 'product', id, { ...input })
  await publishEvent(tenantId, EventType.SALE_CREATED, 'product', id, input)

  revalidatePath('/dashboard/inventory')
  revalidatePath('/dashboard/products')
  return { id, success: true }
}

export async function getProducts(includeInactive = true) {
  const userId = await getUserId()
  await requireRole(userId, ALL_ROLES)
  const tenantId = await getTenantId(userId)

  const whereClause = includeInactive
    ? eq(schema.product.tenantId, tenantId)
    : and(eq(schema.product.tenantId, tenantId), eq(schema.product.status, 'ACTIVE'))

  const prods = await db
    .select({
      id: schema.product.id,
      tenantId: schema.product.tenantId,
      sku: schema.product.sku,
      barcode: schema.product.barcode,
      categoryId: schema.product.categoryId,
      category: schema.product.category,
      name: schema.product.name,
      description: schema.product.description,
      unitPrice: schema.product.unitPrice,
      cost: schema.product.cost,
      margin: schema.product.margin,
      ivaRate: schema.product.ivaRate,
      taxTreatment: schema.product.taxTreatment,
      status: schema.product.status,
      createdAt: schema.product.createdAt,
      updatedAt: schema.product.updatedAt,
      quantity: sql<string>`coalesce(sum(${schema.inventory.quantity}), '0')`,
    })
    .from(schema.product)
    .leftJoin(schema.inventory, eq(schema.product.id, schema.inventory.productId))
    .where(whereClause)
    .groupBy(schema.product.id)
    .orderBy(asc(schema.product.name))

  return prods.map((p) => {
    const uPrice = Number(p.unitPrice || 0)
    const cPrice = Number(p.cost || 0)
    const computedMargin = p.margin !== null && p.margin !== undefined
      ? Number(p.margin)
      : (uPrice > 0 && cPrice > 0 ? Number((((uPrice - cPrice) / uPrice) * 100).toFixed(2)) : 0)

    return {
      ...p,
      category: p.category || 'General',
      margin: computedMargin,
      quantity: Number(p.quantity || 0),
    }
  })
}

export async function updateProduct(
  id: string,
  input: Partial<CreateProductDTO> & { status?: string }
) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER'])
  const tenantId = await getTenantId(userId)

  const updateData: any = { updatedAt: new Date() }
  if (input.name !== undefined) updateData.name = input.name
  if (input.sku !== undefined) updateData.sku = input.sku.trim()
  if (input.barcode !== undefined) updateData.barcode = input.barcode || null
  if (input.description !== undefined) updateData.description = input.description || null
  if (input.category !== undefined) updateData.category = input.category
  if ((input as any).categoryId !== undefined) updateData.categoryId = (input as any).categoryId || null
  if (input.unitPrice !== undefined) updateData.unitPrice = String(input.unitPrice)
  if (input.cost !== undefined) updateData.cost = input.cost !== null ? String(input.cost) : null
  if (input.margin !== undefined) updateData.margin = String(input.margin)
  if (input.ivaRate !== undefined) updateData.ivaRate = String(input.ivaRate)
  if (input.taxTreatment !== undefined) updateData.taxTreatment = input.taxTreatment
  if (input.status !== undefined) updateData.status = input.status

  await db
    .update(schema.product)
    .set(updateData)
    .where(and(eq(schema.product.id, id), eq(schema.product.tenantId, tenantId)))

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'product', id, input)

  revalidatePath('/dashboard/inventory')
  revalidatePath('/dashboard/products')
  revalidatePath('/dashboard/pos')
  return { success: true }
}

export async function toggleProductStatus(id: string, newStatus: string) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER'])
  const tenantId = await getTenantId(userId)

  await db
    .update(schema.product)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(and(eq(schema.product.id, id), eq(schema.product.tenantId, tenantId)))

  revalidatePath('/dashboard/inventory')
  revalidatePath('/dashboard/products')
  revalidatePath('/dashboard/pos')
  return { success: true }
}

export async function deleteProduct(id: string) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER'])
  const tenantId = await getTenantId(userId)

  await db
    .update(schema.product)
    .set({ status: 'INACTIVE', updatedAt: new Date() })
    .where(and(eq(schema.product.id, id), eq(schema.product.tenantId, tenantId)))

  revalidatePath('/dashboard/inventory')
  revalidatePath('/dashboard/products')
  revalidatePath('/dashboard/pos')
  return { success: true }
}

