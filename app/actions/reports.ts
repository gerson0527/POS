'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { and, eq, desc, inArray, gte, lte } from 'drizzle-orm'
import { getUserId, getTenantId } from './_shared'
export async function getSalesReports(startDate?: string, endDate?: string) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const whereConditions: any[] = [
    eq(schema.sale.tenantId, tenantId),
    eq(schema.sale.status, 'COMPLETED')
  ]

  if (startDate) {
    const start = new Date(startDate)
    start.setHours(0, 0, 0, 0)
    whereConditions.push(gte(schema.sale.createdAt, start))
  }

  if (endDate) {
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    whereConditions.push(lte(schema.sale.createdAt, end))
  }

  const salesList = await db
    .select()
    .from(schema.sale)
    .where(and(...whereConditions))
    .orderBy(desc(schema.sale.createdAt))

  const completedSaleIds = salesList.map((s) => s.id)

  let itemsWithCost: any[] = []
  if (completedSaleIds.length > 0) {
    itemsWithCost = await db
      .select({
        saleId: schema.saleItem.saleId,
        productId: schema.saleItem.productId,
        quantity: schema.saleItem.quantity,
        unitPrice: schema.saleItem.unitPrice,
        lineTotal: schema.saleItem.lineTotal,
        productCost: schema.product.cost,
        productName: schema.product.name,
      })
      .from(schema.saleItem)
      .leftJoin(schema.product, eq(schema.saleItem.productId, schema.product.id))
      .where(inArray(schema.saleItem.saleId, completedSaleIds))
  }

  const totalRevenue = salesList.reduce((acc, s) => acc + (Number(s.total) || 0), 0)
  const totalSubtotal = salesList.reduce((acc, s) => acc + (Number(s.subtotal) || 0), 0)
  const totalTaxes = salesList.reduce((acc, s) => acc + (Number(s.taxAmount) || 0), 0)
  const totalSalesCount = salesList.length
  const averageTicket = totalSalesCount > 0 ? totalRevenue / totalSalesCount : 0

  let totalCost = 0
  const productProfitMap = new Map<string, { name: string; qty: number; revenue: number; cost: number }>()

  itemsWithCost.forEach((item) => {
    const qty = Number(item.quantity || 0)
    const price = Number(item.unitPrice || 0)
    const cost = Number(item.productCost || (price * 0.7))
    const lineRev = qty * price
    const lineCost = qty * cost

    totalCost += lineCost

    const pId = item.productId
    const existing = productProfitMap.get(pId) || { name: item.productName || pId, qty: 0, revenue: 0, cost: 0 }
    existing.qty += qty
    existing.revenue += lineRev
    existing.cost += lineCost
    productProfitMap.set(pId, existing)
  })

  const netProfit = totalSubtotal - totalCost
  const profitMarginPercentage = totalSubtotal > 0 ? Number(((netProfit / totalSubtotal) * 100).toFixed(1)) : 0

  const topProfitableProducts = Array.from(productProfitMap.values())
    .map((p) => ({
      ...p,
      netProfit: p.revenue - p.cost,
      margin: p.revenue > 0 ? Number((((p.revenue - p.cost) / p.revenue) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.netProfit - a.netProfit)

  const invoicesList = await db
    .select()
    .from(schema.fiscalDocument)
    .where(eq(schema.fiscalDocument.tenantId, tenantId))

  return {
    totalRevenue,
    totalSubtotal,
    totalTaxes,
    totalCost,
    netProfit,
    profitMarginPercentage,
    totalSalesCount,
    averageTicket,
    totalInvoicesCount: invoicesList.length,
    salesList,
    topProfitableProducts,
  }
}

export async function getTelemetryLogs() {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const logs = await db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.tenantId, tenantId))
    .orderBy(desc(schema.auditLog.createdAt))
    .limit(5)

  if (!logs || logs.length === 0) {
    return []
  }

  return logs.map((log) => ({
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    action: log.action,
    entity: log.entity,
    entityId: log.entityId,
  }))
}

