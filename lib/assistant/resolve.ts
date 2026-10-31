import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { toBusinessDateString } from '@/lib/utils/business-date'
import type { AssistantIntent, CreateSaleIntent, InventoryMovementIntent } from './intents'

export interface ResolvedProduct {
  query: string
  quantity: number
  status: 'matched' | 'ambiguous' | 'not_found'
  product?: {
    id: string
    name: string
    sku: string
    unitPrice: string
    ivaRate: string
    taxTreatment: string | null
  }
  candidates?: Array<{ id: string; name: string; sku: string; score: number }>
}

export interface ResolvedCustomer {
  /**
   * none = no indicó cliente → hay que pedir / ofrecer Consumidor Final
   * final_consumer = confirmó CF o cédula inexistente (aviso en notices)
   * matched / ambiguous = clientes de BD
   * not_found = legado; se normaliza a final_consumer en resolveIntent
   */
  status: 'none' | 'matched' | 'ambiguous' | 'not_found' | 'final_consumer'
  customer?: {
    id: string
    name: string
    documentType: string
    documentNumber: string
    email: string | null
    phone: string | null
    address: string | null
  }
  candidates?: Array<{ id: string; name: string; documentNumber: string }>
  /** Documento buscado que no existía (antes de caer a CF). */
  missingDocument?: string
}

export interface StockLevel {
  locationId: string
  locationName: string
  quantity: number
  available: number
}

export interface ResolvedIntent {
  intent: AssistantIntent
  products: ResolvedProduct[]
  customer: ResolvedCustomer
  openCashSession: {
    id: string
    locationId: string
    locationName: string | null
    businessDate: string
  } | null
  blockers: string[]
  /** Avisos no bloqueantes (ej. cédula inexistente → CF). */
  notices: string[]
  /** Solo para STOCK_QUERY cuando el producto quedó matched. */
  stockLevels?: StockLevel[]
}

const SIMILARITY_THRESHOLD = 0.3

export async function findProductsByQuery(
  tenantId: string,
  query: string,
  limit = 5
): Promise<Array<{ id: string; name: string; sku: string; score: number; unitPrice: string; ivaRate: string; taxTreatment: string | null }>> {
  const q = query.trim()
  if (!q) return []

  const exact = await db
    .select({
      id: schema.product.id,
      name: schema.product.name,
      sku: schema.product.sku,
      unitPrice: schema.product.unitPrice,
      ivaRate: schema.product.ivaRate,
      taxTreatment: schema.product.taxTreatment,
    })
    .from(schema.product)
    .where(
      and(
        eq(schema.product.tenantId, tenantId),
        eq(schema.product.status, 'ACTIVE'),
        sql`(lower(${schema.product.sku}) = lower(${q}) OR lower(coalesce(${schema.product.barcode}, '')) = lower(${q}))`
      )
    )
    .limit(1)
  if (exact[0]) {
    return [{ ...exact[0], score: 1 }]
  }

  const result: any = await db.execute(sql`
    SELECT p.id, p.name, p.sku, p."unitPrice", p."ivaRate", p."taxTreatment",
           GREATEST(
             similarity(lower(p.name), lower(${q})),
             coalesce((
               SELECT max(similarity(lower(a.alias), lower(${q})))
               FROM product_alias a
               WHERE a."tenantId" = ${tenantId} AND a."productId" = p.id
             ), 0)
           ) AS score
    FROM product p
    WHERE p."tenantId" = ${tenantId}
      AND p.status = 'ACTIVE'
      AND (
        similarity(lower(p.name), lower(${q})) >= ${SIMILARITY_THRESHOLD}
        OR EXISTS (
          SELECT 1 FROM product_alias a
          WHERE a."tenantId" = ${tenantId}
            AND a."productId" = p.id
            AND similarity(lower(a.alias), lower(${q})) >= ${SIMILARITY_THRESHOLD}
        )
      )
    ORDER BY score DESC
    LIMIT ${limit}
  `)

  return (result?.rows ?? result ?? []) as Array<{
    id: string
    name: string
    sku: string
    unitPrice: string
    ivaRate: string
    taxTreatment: string | null
    score: number
  }>
}

async function resolveProductLine(
  tenantId: string,
  query: string,
  quantity: number
): Promise<ResolvedProduct> {
  const matches = await findProductsByQuery(tenantId, query)
  if (!matches.length) {
    return { query, quantity, status: 'not_found' }
  }
  const top = matches[0]
  const second = matches[1]
  if (second && top.score - second.score < 0.08 && second.score >= SIMILARITY_THRESHOLD) {
    return {
      query,
      quantity,
      status: 'ambiguous',
      candidates: matches.map((m) => ({
        id: m.id,
        name: m.name,
        sku: m.sku,
        score: Number(m.score),
      })),
    }
  }
  return {
    query,
    quantity,
    status: 'matched',
    product: {
      id: top.id,
      name: top.name,
      sku: top.sku,
      unitPrice: top.unitPrice,
      ivaRate: top.ivaRate,
      taxTreatment: top.taxTreatment,
    },
  }
}

const FINAL_CONSUMER_DOCS = new Set(['222222222222', '222222222', '0'])

function isExplicitFinalConsumer(hint: CreateSaleIntent['customer']): boolean {
  if (!hint) return false
  const doc = (hint.documentNumber || '').replace(/\D/g, '')
  if (doc && FINAL_CONSUMER_DOCS.has(doc)) return true
  const name = (hint.name || '').trim().toLowerCase()
  return /consumidor\s*final|^cf$/.test(name)
}

async function resolveCustomer(
  tenantId: string,
  hint: CreateSaleIntent['customer']
): Promise<ResolvedCustomer> {
  if (!hint || (!hint.documentNumber && !hint.name)) {
    return { status: 'none' }
  }

  if (isExplicitFinalConsumer(hint)) {
    return { status: 'final_consumer' }
  }

  if (hint.documentNumber) {
    const doc = hint.documentNumber.replace(/\D/g, '') || hint.documentNumber.trim()
    const rows = await db
      .select()
      .from(schema.customer)
      .where(
        and(
          eq(schema.customer.tenantId, tenantId),
          eq(schema.customer.documentNumber, doc)
        )
      )
      .limit(1)
    const row = rows[0]
    if (!row) {
      return { status: 'not_found', missingDocument: doc }
    }
    return {
      status: 'matched',
      customer: {
        id: row.id,
        name: row.name,
        documentType: row.documentType,
        documentNumber: row.documentNumber,
        email: row.email,
        phone: row.phone,
        address: row.address,
      },
    }
  }

  const name = hint.name!.trim()
  const result: any = await db.execute(sql`
    SELECT id, name, "documentNumber", "documentType", email, phone, address,
           similarity(lower(name), lower(${name})) AS score
    FROM customer
    WHERE "tenantId" = ${tenantId}
      AND status = 'ACTIVE'
      AND similarity(lower(name), lower(${name})) >= ${SIMILARITY_THRESHOLD}
    ORDER BY score DESC
    LIMIT 5
  `)
  const list = (result?.rows ?? result ?? []) as Array<{
    id: string
    name: string
    documentNumber: string
    documentType: string
    email: string | null
    phone: string | null
    address: string | null
    score: number
  }>
  if (!list.length) return { status: 'not_found' }
  if (list.length > 1 && Number(list[0].score) - Number(list[1]?.score ?? 0) < 0.1) {
    return {
      status: 'ambiguous',
      candidates: list.map((c) => ({
        id: c.id,
        name: c.name,
        documentNumber: c.documentNumber,
      })),
    }
  }
  const c = list[0]
  return {
    status: 'matched',
    customer: {
      id: c.id,
      name: c.name,
      documentType: c.documentType,
      documentNumber: c.documentNumber,
      email: c.email,
      phone: c.phone,
      address: c.address,
    },
  }
}

export async function getOpenCashSession(tenantId: string, userId: string, businessDate: string) {
  const rows = await db
    .select({
      id: schema.cashierSession.id,
      locationId: schema.cashierSession.locationId,
      businessDate: schema.cashierSession.businessDate,
      locationName: schema.location.name,
    })
    .from(schema.cashierSession)
    .leftJoin(
      schema.location,
      and(
        eq(schema.location.id, schema.cashierSession.locationId),
        eq(schema.location.tenantId, tenantId)
      )
    )
    .where(
      and(
        eq(schema.cashierSession.tenantId, tenantId),
        eq(schema.cashierSession.userId, userId),
        eq(schema.cashierSession.status, 'OPEN'),
        eq(schema.cashierSession.businessDate, businessDate)
      )
    )
    .orderBy(sql`${schema.cashierSession.openedAt} DESC`)
    .limit(1)

  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    locationId: row.locationId,
    locationName: row.locationName,
    businessDate: toBusinessDateString(row.businessDate),
  }
}

function intentItems(
  intent: AssistantIntent
): Array<{ query: string; quantity: number }> {
  if (intent.type === 'CREATE_SALE') return intent.items
  if (
    intent.type === 'INVENTORY_IN' ||
    intent.type === 'INVENTORY_OUT' ||
    intent.type === 'INVENTORY_ADJUSTMENT'
  ) {
    return (intent as InventoryMovementIntent).items
  }
  if (intent.type === 'STOCK_QUERY') return [{ query: intent.query, quantity: 1 }]
  return []
}

export async function resolveIntent(
  tenantId: string,
  userId: string,
  intent: AssistantIntent,
  businessDate: string
): Promise<ResolvedIntent> {
  const blockers: string[] = []
  const notices: string[] = []
  const products: ResolvedProduct[] = []

  for (const item of intentItems(intent)) {
    products.push(await resolveProductLine(tenantId, item.query, item.quantity))
  }

  for (const p of products) {
    if (p.status === 'not_found') blockers.push(`No encontré el producto "${p.query}".`)
    if (p.status === 'ambiguous') {
      blockers.push(
        `Varios productos coinciden con "${p.query}": ${p.candidates?.map((c) => c.name).join(', ')}.`
      )
    }
  }

  let customer: ResolvedCustomer = { status: 'none' }
  if (intent.type === 'CREATE_SALE') {
    customer = await resolveCustomer(tenantId, intent.customer)
    if (customer.status === 'not_found') {
      const doc = customer.missingDocument || intent.customer?.documentNumber || 'indicado'
      notices.push(
        `No encontré el cliente con documento ${doc}. Se continuará como CONSUMIDOR FINAL.`
      )
      customer = { status: 'final_consumer', missingDocument: customer.missingDocument }
    }
    if (customer.status === 'none') {
      blockers.push(
        'Indique el cliente (ej. `cliente 1234567890`) o pulse *Consumidor final*.'
      )
    }
    if (customer.status === 'ambiguous') {
      blockers.push(
        `Varios clientes coinciden: ${customer.candidates?.map((c) => `${c.name} (${c.documentNumber})`).join(', ')}.`
      )
    }
  }

  const openCashSession = await getOpenCashSession(tenantId, userId, businessDate)

  if (intent.type === 'CREATE_SALE' && !openCashSession) {
    blockers.push(
      'No hay un turno de caja abierto para hoy. Abra caja en el POS antes de facturar por el bot.'
    )
  }

  let stockLevels: StockLevel[] | undefined
  if (intent.type === 'STOCK_QUERY' && products[0]?.status === 'matched' && products[0].product) {
    const { getProductStock } = await import('./stock')
    stockLevels = await getProductStock(tenantId, products[0].product.id)
  }

  return { intent, products, customer, openCashSession, blockers, notices, stockLevels }
}

/** Recalcula blockers a partir del estado actual de products/customer/sesión. */
export function recomputeBlockers(resolved: ResolvedIntent): ResolvedIntent {
  const blockers: string[] = []
  const notices = [...(resolved.notices || [])]
  for (const p of resolved.products) {
    if (p.status === 'not_found') blockers.push(`No encontré el producto "${p.query}".`)
    if (p.status === 'ambiguous') {
      blockers.push(
        `Varios productos coinciden con "${p.query}": ${p.candidates?.map((c) => c.name).join(', ')}.`
      )
    }
  }
  if (resolved.customer.status === 'none' && resolved.intent.type === 'CREATE_SALE') {
    blockers.push(
      'Indique el cliente (ej. `cliente 1234567890`) o pulse *Consumidor final*.'
    )
  }
  if (resolved.customer.status === 'not_found') {
    // Normalizar legado → CF con aviso
    const doc = resolved.customer.missingDocument || 'indicado'
    if (!notices.some((n) => /CONSUMIDOR FINAL/i.test(n))) {
      notices.push(
        `No encontré el cliente con documento ${doc}. Se continuará como CONSUMIDOR FINAL.`
      )
    }
    return recomputeBlockers({
      ...resolved,
      customer: { status: 'final_consumer', missingDocument: resolved.customer.missingDocument },
      notices,
    })
  }
  if (resolved.customer.status === 'ambiguous') {
    blockers.push(
      `Varios clientes coinciden: ${resolved.customer.candidates?.map((c) => `${c.name} (${c.documentNumber})`).join(', ')}.`
    )
  }
  if (resolved.intent.type === 'CREATE_SALE' && !resolved.openCashSession) {
    blockers.push(
      'No hay un turno de caja abierto para hoy. Abra caja en el POS antes de facturar por el bot.'
    )
  }
  return { ...resolved, blockers, notices }
}

/** El usuario eligió facturar como Consumidor Final. */
export function applyFinalConsumer(resolved: ResolvedIntent): ResolvedIntent {
  return recomputeBlockers({
    ...resolved,
    customer: { status: 'final_consumer' },
  })
}

/**
 * Aplica la elección de un producto ambiguo, hidrata precio/IVA desde BD
 * y recalcula blockers.
 */
export async function applyProductChoice(
  tenantId: string,
  resolved: ResolvedIntent,
  lineIndex: number,
  productId: string
): Promise<ResolvedIntent> {
  const line = resolved.products[lineIndex]
  if (!line || line.status !== 'ambiguous') return recomputeBlockers(resolved)
  const chosen = line.candidates?.find((c) => c.id === productId)
  if (!chosen) return recomputeBlockers(resolved)

  const rows = await db
    .select({
      id: schema.product.id,
      name: schema.product.name,
      sku: schema.product.sku,
      unitPrice: schema.product.unitPrice,
      ivaRate: schema.product.ivaRate,
      taxTreatment: schema.product.taxTreatment,
    })
    .from(schema.product)
    .where(and(eq(schema.product.id, productId), eq(schema.product.tenantId, tenantId)))
    .limit(1)
  const row = rows[0]
  if (!row) {
    const products = [...resolved.products]
    products[lineIndex] = { ...line, status: 'not_found', product: undefined, candidates: undefined }
    return recomputeBlockers({ ...resolved, products })
  }

  const products = [...resolved.products]
  products[lineIndex] = {
    query: line.query,
    quantity: line.quantity,
    status: 'matched',
    product: {
      id: row.id,
      name: row.name,
      sku: row.sku,
      unitPrice: row.unitPrice,
      ivaRate: row.ivaRate,
      taxTreatment: row.taxTreatment,
    },
  }
  return recomputeBlockers({ ...resolved, products })
}

export async function applyCustomerChoice(
  tenantId: string,
  resolved: ResolvedIntent,
  customerId: string
): Promise<ResolvedIntent> {
  if (resolved.customer.status !== 'ambiguous') return recomputeBlockers(resolved)
  const rows = await db
    .select()
    .from(schema.customer)
    .where(and(eq(schema.customer.id, customerId), eq(schema.customer.tenantId, tenantId)))
    .limit(1)
  const row = rows[0]
  if (!row) {
    return recomputeBlockers({
      ...resolved,
      customer: { status: 'not_found' },
    })
  }
  return recomputeBlockers({
    ...resolved,
    customer: {
      status: 'matched',
      customer: {
        id: row.id,
        name: row.name,
        documentType: row.documentType,
        documentNumber: row.documentNumber,
        email: row.email,
        phone: row.phone,
        address: row.address,
      },
    },
  })
}
