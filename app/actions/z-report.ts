import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { SaleStatus } from '@/lib/types'
import { formatBogotaDateTime } from './_shared'

type CashierSessionRow = typeof schema.cashierSession.$inferSelect
type SaleRow = typeof schema.sale.$inferSelect
type PaymentRow = typeof schema.payment.$inferSelect
type SaleItemRow = typeof schema.saleItem.$inferSelect

export interface ZReportSale extends SaleRow {
  payments: PaymentRow[]
  paymentMethod: string
  paymentReference: string | null
}

export interface ZReportCompany {
  legalName: string
  nit: string
  address: string | null
  city: string | null
}

export interface ZReportData {
  hasOpenSession: boolean
  session: CashierSessionRow
  user: { id: string; name: string | null; email: string | null } | null
  userName: string
  userEmail: string | null
  company: ZReportCompany
  dianEnvironment: string
  openedAtDisplay: string | null
  closedAtDisplay: string | null
  isOverdue: boolean
  daysOverdue: number
  totalSalesCount: number
  totalRevenue: number
  totalSubtotal: number
  totalTax: number
  tax19: number
  tax5: number
  tax0: number
  cashSales: number
  cashCount: number
  nequiSales: number
  nequiCount: number
  creditCardSales: number
  creditCardCount: number
  debitCardSales: number
  debitCardCount: number
  cardSales: number
  transferSales: number
  creditSales: number
  openingBase: number
  expectedCash: number
  minTicket: number
  maxTicket: number
  salesList: ZReportSale[]
}

/**
 * Construye los datos del Reporte Z (arqueo de cierre) de una sesión de caja.
 * Extraído de pos-actions.ts en la Fase 3.19 con tipo de retorno explícito
 * (antes devolvía `any`).
 */
export async function buildSessionZReportData(sess: CashierSessionRow): Promise<ZReportData> {
  const completedSales = await db
    .select()
    .from(schema.sale)
    .where(
      and(
        eq(schema.sale.cashierSessionId, sess.id),
        eq(schema.sale.status, SaleStatus.COMPLETED)
      )
    )

  const saleIds = completedSales.map((s) => s.id)
  let payments: PaymentRow[] = []
  let items: SaleItemRow[] = []

  if (saleIds.length > 0) {
    payments = await db
      .select()
      .from(schema.payment)
      .where(inArray(schema.payment.saleId, saleIds))

    items = await db
      .select()
      .from(schema.saleItem)
      .where(inArray(schema.saleItem.saleId, saleIds))
  }

  const openingBase = Number(sess.openingBalance || 0)
  let cashSales = 0
  let cashCount = 0
  let nequiSales = 0
  let nequiCount = 0
  let creditCardSales = 0
  let creditCardCount = 0
  let debitCardSales = 0
  let debitCardCount = 0
  let otherSales = 0
  let otherCount = 0

  payments.forEach((p) => {
    const amt = Number(p.amount || 0)
    const m = (p.method || '').toUpperCase()
    if (m === 'CASH' || m === 'EFECTIVO') {
      cashSales += amt
      cashCount++
    } else if (m === 'NEQUI') {
      nequiSales += amt
      nequiCount++
    } else if (m === 'CREDIT_CARD' || m === 'TARJETA_CREDITO') {
      creditCardSales += amt
      creditCardCount++
    } else if (m === 'DEBIT_CARD' || m === 'TARJETA_DEBITO') {
      debitCardSales += amt
      debitCardCount++
    } else if (m === 'CARD' || m === 'TARJETA') {
      creditCardSales += amt
      creditCardCount++
    } else if (m === 'TRANSFER' || m === 'TRANSFERENCIA') {
      nequiSales += amt
      nequiCount++
    } else {
      otherSales += amt
      otherCount++
    }
  })

  if (payments.length === 0 && completedSales.length > 0) {
    cashSales = completedSales.reduce((sum, s) => sum + Number(s.total || 0), 0)
    cashCount = completedSales.length
  }

  const cardSales = creditCardSales + debitCardSales
  const transferSales = nequiSales
  const creditSales = otherSales

  const salesList: ZReportSale[] = completedSales.map((s) => {
    const salePayments = payments.filter((p) => p.saleId === s.id)
    return {
      ...s,
      payments: salePayments,
      paymentMethod: salePayments.map((p) => p.method).join(', ') || 'EFECTIVO',
      paymentReference: salePayments.map((p) => p.reference).filter(Boolean).join(', ') || null,
    }
  })

  const totalRevenue = completedSales.reduce((sum, s) => sum + Number(s.total || 0), 0)
  const totalSubtotal = completedSales.reduce((sum, s) => sum + Number(s.subtotal || 0), 0)
  const totalTax = completedSales.reduce((sum, s) => sum + Number(s.taxAmount || 0), 0)

  let tax19 = 0
  let tax5 = 0
  let tax0 = 0
  items.forEach((it) => {
    const rate = Number(it.ivaRate || 0)
    const taxAmt = Number(it.ivaAmount || 0)
    if (rate === 19) tax19 += taxAmt
    else if (rate === 5) tax5 += taxAmt
    else tax0 += taxAmt
  })

  const ticketNumbers = completedSales.map((s) => s.ticketNumber).filter((t): t is number => typeof t === 'number' && t > 0)
  const minTicket = ticketNumbers.length > 0 ? Math.min(...ticketNumbers) : 0
  const maxTicket = ticketNumbers.length > 0 ? Math.max(...ticketNumbers) : 0

  const expectedCash = openingBase + cashSales

  const sessionOpenedAt = new Date(sess.openedAt)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)

  const isOverdue = sess.status === 'OPEN' && sessionOpenedAt.getTime() < todayStart.getTime()
  const daysOverdue = isOverdue
    ? Math.max(1, Math.floor((todayStart.getTime() - new Date(sessionOpenedAt.getFullYear(), sessionOpenedAt.getMonth(), sessionOpenedAt.getDate()).getTime()) / (1000 * 60 * 60 * 24)))
    : 0

  const sessionUserRes = sess.userId ? await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.user)
    .where(eq(schema.user.id, sess.userId))
    .limit(1) : []

  const sessionUser = sessionUserRes[0] || null

  const tenantRows = await db
    .select({
      legalName: schema.tenant.legalName,
      nit: schema.tenant.nit,
      address: schema.tenant.address,
      city: schema.tenant.city,
      factusEnvironment: schema.tenant.factusEnvironment,
    })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, sess.tenantId))
    .limit(1)
  const tenantRow = tenantRows[0] || null

  const company: ZReportCompany = {
    legalName: tenantRow?.legalName || 'Comercializadora POS Retail S.A.S.',
    nit: tenantRow?.nit || '',
    address: tenantRow?.address || null,
    city: tenantRow?.city || null,
  }

  return {
    hasOpenSession: sess.status === 'OPEN',
    session: sess,
    user: sessionUser,
    userName: sessionUser?.name || sessionUser?.email || sess.userId || 'Operador POS',
    userEmail: sessionUser?.email || null,
    company,
    dianEnvironment: tenantRow?.factusEnvironment || 'sandbox',
    openedAtDisplay: formatBogotaDateTime(sess.openedAt),
    closedAtDisplay: formatBogotaDateTime(sess.closedAt),
    isOverdue,
    daysOverdue,
    totalSalesCount: completedSales.length,
    totalRevenue,
    totalSubtotal,
    totalTax,
    tax19,
    tax5,
    tax0,
    cashSales,
    cashCount,
    nequiSales,
    nequiCount,
    creditCardSales,
    creditCardCount,
    debitCardSales,
    debitCardCount,
    cardSales,
    transferSales,
    creditSales,
    openingBase,
    expectedCash,
    minTicket,
    maxTicket,
    salesList,
  }
}
