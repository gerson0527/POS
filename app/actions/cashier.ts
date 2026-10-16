'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import {
  AuditAction
} from '@/lib/types'
import { and, eq, desc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUserId, getTenantId, logAudit } from './_shared'
import { buildSessionZReportData } from './z-report'
export async function getCurrentCashierSessionSummary() {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const openSessions = await db
    .select()
    .from(schema.cashierSession)
    .where(
      and(
        eq(schema.cashierSession.tenantId, tenantId),
        eq(schema.cashierSession.status, 'OPEN')
      )
    )
    .limit(1)

  if (!openSessions.length) {
    return { hasOpenSession: false, session: null }
  }

  const sess = openSessions[0]
  return await buildSessionZReportData(sess)
}

export async function openCashierSession(openingBalance: number, notes?: string, assignedUserId?: string) {
  const currentUserId = await getUserId()
  const tenantId = await getTenantId(currentUserId)
  const userId = assignedUserId || currentUserId

  const existing = await db
    .select()
    .from(schema.cashierSession)
    .where(
      and(
        eq(schema.cashierSession.tenantId, tenantId),
        eq(schema.cashierSession.status, 'OPEN')
      )
    )
    .limit(1)

  if (existing.length > 0) {
    throw new Error('Ya existe una caja abierta en el sistema. Solo se permite tener una caja abierta a la vez.')
  }

  const locations = await db.select().from(schema.location).where(eq(schema.location.tenantId, tenantId)).limit(1)
  const locationId = locations[0]?.id || 'loc_bogota_01'

  const sessionId = `cs_${Date.now()}`
  await db.insert(schema.cashierSession).values({
    id: sessionId,
    tenantId,
    locationId,
    userId,
    status: 'OPEN',
    openingBalance: String(openingBalance || 0),
    notes: notes || null,
    openedAt: new Date(),
  })

  await logAudit(tenantId, currentUserId, AuditAction.CREATE, 'cashier_session', sessionId, { openingBalance, notes, assignedUserId: userId })
  revalidatePath('/dashboard/pos')
  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/cash-closure')
  return { success: true, sessionId }
}

export async function closeCashierSession(sessionId: string, closingBalance: number, notes?: string) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const sessions = await db
    .select()
    .from(schema.cashierSession)
    .where(and(eq(schema.cashierSession.id, sessionId), eq(schema.cashierSession.tenantId, tenantId)))
    .limit(1)

  if (!sessions.length) throw new Error('Sesión de caja no encontrada.')
  const sess = sessions[0]

  const summary = await buildSessionZReportData(sess)
  const expectedBalance = summary.expectedCash
  const difference = Number(closingBalance) - expectedBalance

  await db
    .update(schema.cashierSession)
    .set({
      status: 'CLOSED',
      closedAt: new Date(),
      closingBalance: String(closingBalance),
      expectedBalance: String(expectedBalance),
      difference: String(difference),
      totalSales: String(summary.totalRevenue),
      cashSales: String(summary.cashSales),
      cardSales: String(summary.cardSales),
      transferSales: String(summary.transferSales),
      creditSales: String(summary.creditSales),
      salesCount: summary.totalSalesCount,
      notes: notes || sess.notes || null,
    })
    .where(eq(schema.cashierSession.id, sessionId))

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'cashier_session', sessionId, {
    closingBalance,
    expectedBalance,
    difference,
    notes,
  })

  revalidatePath('/dashboard/pos')
  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/cash-closure')

  return { success: true, zReport: { ...summary, closingBalance, difference } }
}

export async function getCashierSessionsHistory() {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const history = await db
    .select({
      id: schema.cashierSession.id,
      tenantId: schema.cashierSession.tenantId,
      locationId: schema.cashierSession.locationId,
      userId: schema.cashierSession.userId,
      openedAt: schema.cashierSession.openedAt,
      closedAt: schema.cashierSession.closedAt,
      openingBalance: schema.cashierSession.openingBalance,
      closingBalance: schema.cashierSession.closingBalance,
      expectedBalance: schema.cashierSession.expectedBalance,
      difference: schema.cashierSession.difference,
      totalSales: schema.cashierSession.totalSales,
      cashSales: schema.cashierSession.cashSales,
      cardSales: schema.cashierSession.cardSales,
      transferSales: schema.cashierSession.transferSales,
      creditSales: schema.cashierSession.creditSales,
      salesCount: schema.cashierSession.salesCount,
      status: schema.cashierSession.status,
      notes: schema.cashierSession.notes,
      userName: schema.user.name,
      userEmail: schema.user.email,
    })
    .from(schema.cashierSession)
    .leftJoin(schema.user, eq(schema.cashierSession.userId, schema.user.id))
    .where(eq(schema.cashierSession.tenantId, tenantId))
    .orderBy(desc(schema.cashierSession.openedAt))

  return history
}

export async function getCashierSessionDetails(sessionId: string) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const sessions = await db
    .select()
    .from(schema.cashierSession)
    .where(and(eq(schema.cashierSession.id, sessionId), eq(schema.cashierSession.tenantId, tenantId)))
    .limit(1)

  if (!sessions.length) throw new Error('Sesión de caja no encontrada.')
  return await buildSessionZReportData(sessions[0])
}

