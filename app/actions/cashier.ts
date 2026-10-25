'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import {
  AuditAction
} from '@/lib/types'
import { and, eq, desc, lt, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import {
  getUserId,
  getTenantId,
  logAudit,
  requireRole,
  getBogotaBusinessDate,
  toBusinessDateString,
} from './_shared'
import { buildSessionZReportData } from './z-report'
import { ALL_ROLES } from '@/lib/auth/permissions'

const CASH_MOVEMENT_TYPES = ['INGRESO', 'EGRESO', 'RETIRO', 'DEVOLUCION'] as const

export async function getCurrentCashierSessionSummary() {
  const userId = await getUserId()
  await requireRole(userId, ALL_ROLES)
  const tenantId = await getTenantId(userId)
  const businessDate = getBogotaBusinessDate()

  const openSessions = await db
    .select()
    .from(schema.cashierSession)
    .where(
      and(
        eq(schema.cashierSession.tenantId, tenantId),
        eq(schema.cashierSession.userId, userId),
        eq(schema.cashierSession.status, 'OPEN'),
        eq(schema.cashierSession.businessDate, businessDate)
      )
    )
    .orderBy(desc(schema.cashierSession.openedAt))
    .limit(1)

  const pendingSessions = await db
    .select({
      id: schema.cashierSession.id,
      businessDate: schema.cashierSession.businessDate,
      openedAt: schema.cashierSession.openedAt,
      locationId: schema.cashierSession.locationId,
      isOverride: schema.cashierSession.isOverride,
    })
    .from(schema.cashierSession)
    .where(
      and(
        eq(schema.cashierSession.tenantId, tenantId),
        eq(schema.cashierSession.userId, userId),
        eq(schema.cashierSession.status, 'OPEN'),
        lt(schema.cashierSession.businessDate, businessDate)
      )
    )
    .orderBy(desc(schema.cashierSession.openedAt))

  const normalizedPendingSessions = pendingSessions.map((session) => ({
    ...session,
    businessDate: toBusinessDateString(session.businessDate),
  }))

  if (!openSessions.length) {
    return {
      hasOpenSession: false,
      session: null,
      businessDate,
      pendingSessions: normalizedPendingSessions,
    }
  }

  const sess = openSessions[0]
  const summary = await buildSessionZReportData(sess)
  return { ...summary, businessDate, pendingSessions: normalizedPendingSessions }
}

export async function registerCashMovement(input: {
  type: string
  concept: string
  amount: number
  note?: string
}) {
  const userId = await getUserId()
  const membership = await requireRole(userId, ['ADMIN', 'MANAGER', 'CASHIER'])
  const tenantId = await getTenantId(userId)

  const type = String(input.type || '').trim().toUpperCase()
  if (!CASH_MOVEMENT_TYPES.includes(type as (typeof CASH_MOVEMENT_TYPES)[number])) {
    throw new Error('Tipo de movimiento de caja inválido.')
  }

  const concept = String(input.concept || '').trim()
  if (!concept) throw new Error('El concepto del movimiento es obligatorio.')
  if (concept.length > 160) throw new Error('El concepto no puede superar 160 caracteres.')

  const requested = Number(input.amount)
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new Error('El valor del movimiento debe ser mayor a cero.')
  }
  const amount = Math.round(requested * 100) / 100

  const conditions = [
    eq(schema.cashierSession.tenantId, tenantId),
    eq(schema.cashierSession.status, 'OPEN'),
    eq(schema.cashierSession.businessDate, getBogotaBusinessDate()),
  ]
  if (membership.role === 'CASHIER') {
    conditions.push(eq(schema.cashierSession.userId, userId))
  }

  const sessions = await db
    .select({ id: schema.cashierSession.id })
    .from(schema.cashierSession)
    .where(and(...conditions))
    .orderBy(desc(schema.cashierSession.openedAt))
    .limit(1)

  if (!sessions.length) {
    throw new Error('No hay una caja abierta autorizada para registrar el movimiento.')
  }

  const movementId = `cm_${randomUUID()}`
  await db.insert(schema.cashMovement).values({
    id: movementId,
    tenantId,
    cashierSessionId: sessions[0].id,
    type,
    concept,
    amount: String(amount),
    note: input.note?.trim() || null,
    createdBy: userId,
  })

  await logAudit(tenantId, userId, AuditAction.CREATE, 'cash_movement', movementId, {
    type,
    concept,
    amount,
    cashierSessionId: sessions[0].id,
  })

  revalidatePath('/dashboard/pos')
  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/cash-closure')
  return { success: true, movementId }
}

export async function openCashierSession(
  openingBalance: number,
  notes?: string,
  assignedUserId?: string,
  options?: {
    locationId?: string
    override?: { reason: string }
  }
) {
  const currentUserId = await getUserId()
  const membership = await requireRole(currentUserId, ['ADMIN', 'MANAGER', 'CASHIER'])
  const tenantId = await getTenantId(currentUserId)
  const userId = assignedUserId || currentUserId

  if (!Number.isFinite(openingBalance) || openingBalance < 0) {
    throw new Error('El saldo inicial debe ser un número mayor o igual a cero.')
  }

  if (assignedUserId && assignedUserId !== currentUserId) {
    await requireRole(currentUserId, ['ADMIN', 'MANAGER'])
    const assigned = await db
      .select({ id: schema.userTenant.id })
      .from(schema.userTenant)
      .where(
        and(
          eq(schema.userTenant.userId, assignedUserId),
          eq(schema.userTenant.tenantId, tenantId),
          eq(schema.userTenant.status, 'ACTIVE')
        )
      )
      .limit(1)
    if (!assigned.length) {
      throw new Error('El cajero asignado no pertenece al tenant o está inactivo.')
    }
  }

  const overrideReason = options?.override?.reason?.trim() || ''
  const overrideRequested = Boolean(options?.override)
  if (overrideRequested) {
    if (membership.role !== 'ADMIN') {
      throw new Error(
        'Solo un administrador puede autorizar la apertura con un turno anterior pendiente.'
      )
    }
    if (overrideReason.length < 5) {
      throw new Error('Debe registrar el motivo de la autorización (mínimo 5 caracteres).')
    }
  }

  const locations = options?.locationId
    ? await db
        .select({ id: schema.location.id })
        .from(schema.location)
        .where(
          and(
            eq(schema.location.id, options.locationId),
            eq(schema.location.tenantId, tenantId),
            eq(schema.location.status, 'ACTIVE')
          )
        )
        .limit(1)
    : await db
        .select({ id: schema.location.id })
        .from(schema.location)
        .where(
          and(
            eq(schema.location.tenantId, tenantId),
            eq(schema.location.status, 'ACTIVE')
          )
        )
        .limit(1)

  if (!locations.length) {
    throw new Error('No hay una sede activa configurada para abrir caja.')
  }
  const locationId = locations[0].id
  const businessDate = getBogotaBusinessDate()

  const sessionId = `cs_${randomUUID()}`
  let previousOpenSessionIds: string[] = []

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:${userId}`}))`
      )

      const existing = await tx
        .select()
        .from(schema.cashierSession)
        .where(
          and(
            eq(schema.cashierSession.tenantId, tenantId),
            eq(schema.cashierSession.userId, userId),
            eq(schema.cashierSession.status, 'OPEN')
          )
        )

      const openToday = existing.find(
        (session) => toBusinessDateString(session.businessDate) === businessDate
      )
      if (openToday) {
        throw new Error('El usuario ya tiene una caja abierta para la fecha de hoy.')
      }

      if (existing.length > 0 && !overrideRequested) {
        throw new Error(
          'Existe un turno de caja abierto. Debe cerrarlo antes de abrir uno nuevo o solicitar autorización de un administrador.'
        )
      }

      if (overrideRequested && existing.length === 0) {
        throw new Error('No hay un turno pendiente que requiera autorización.')
      }

      previousOpenSessionIds = existing.map((session) => session.id)

      await tx.insert(schema.cashierSession).values({
        id: sessionId,
        tenantId,
        locationId,
        userId,
        businessDate,
        status: 'OPEN',
        openingBalance: String(openingBalance || 0),
        notes: notes || null,
        openedAt: new Date(),
        isOverride: overrideRequested,
        authorizedBy: overrideRequested ? currentUserId : null,
        overrideReason: overrideRequested ? overrideReason : null,
      })
    })
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error('El usuario ya tiene una caja abierta.')
    }
    throw error
  }

  await logAudit(tenantId, currentUserId, AuditAction.CREATE, 'cashier_session', sessionId, {
    openingBalance,
    notes,
    assignedUserId: userId,
    businessDate,
    locationId,
    override: overrideRequested,
    overrideReason: overrideRequested ? overrideReason : null,
    authorizedBy: overrideRequested ? currentUserId : null,
    previousOpenSessionIds,
  })
  revalidatePath('/dashboard/pos')
  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/cash-closure')
  return { success: true, sessionId, businessDate }
}

export async function closeCashierSession(sessionId: string, closingBalance: number, notes?: string) {
  const userId = await getUserId()
  const membership = await requireRole(userId, ['ADMIN', 'MANAGER', 'CASHIER'])
  const tenantId = await getTenantId(userId)

  if (!Number.isFinite(closingBalance) || closingBalance < 0) {
    throw new Error('El saldo de cierre debe ser un número mayor o igual a cero.')
  }

  const result = await db.transaction(async (tx) => {
    // Bloquea el turno para que ninguna venta se complete mientras se calcula
    // el arqueo. completeSale también bloquea esta fila antes de cobrar.
    const sessions = await tx
      .select()
      .from(schema.cashierSession)
      .where(
        and(
          eq(schema.cashierSession.id, sessionId),
          eq(schema.cashierSession.tenantId, tenantId)
        )
      )
      .limit(1)
      .for('update')

    if (!sessions.length) throw new Error('Sesión de caja no encontrada.')
    const sess = sessions[0]
    if (sess.status !== 'OPEN') throw new Error('La sesión de caja ya está cerrada.')
    if (membership.role === 'CASHIER' && sess.userId !== userId) {
      throw new Error('No puede cerrar la caja de otro usuario.')
    }

    const summary = await buildSessionZReportData(sess)
    const expectedBalance = summary.expectedCash
    const difference = Number(closingBalance) - expectedBalance
    const closedAt = new Date()

    const closed = await tx
      .update(schema.cashierSession)
      .set({
        status: 'CLOSED',
        closedAt,
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
      .where(
        and(
          eq(schema.cashierSession.id, sessionId),
          eq(schema.cashierSession.tenantId, tenantId),
          eq(schema.cashierSession.status, 'OPEN')
        )
      )
      .returning({ id: schema.cashierSession.id })

    if (!closed.length) throw new Error('La sesión de caja ya fue cerrada por otro usuario.')

    return { sess, summary, expectedBalance, difference, closedAt }
  })

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'cashier_session', sessionId, {
    closingBalance,
    expectedBalance: result.expectedBalance,
    difference: result.difference,
    notes,
    businessDate: toBusinessDateString(result.sess.businessDate),
    closedAt: result.closedAt.toISOString(),
  })

  revalidatePath('/dashboard/pos')
  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/cash-closure')

  return {
    success: true,
    zReport: {
      ...result.summary,
      closingBalance,
      difference: result.difference,
    },
  }
}

export async function getCashierSessionsHistory() {
  const userId = await getUserId()
  const membership = await requireRole(userId, ['ADMIN', 'MANAGER', 'CASHIER'])
  const tenantId = await getTenantId(userId)

  const history = await db
    .select({
      id: schema.cashierSession.id,
      tenantId: schema.cashierSession.tenantId,
      locationId: schema.cashierSession.locationId,
      userId: schema.cashierSession.userId,
      businessDate: schema.cashierSession.businessDate,
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
      isOverride: schema.cashierSession.isOverride,
      authorizedBy: schema.cashierSession.authorizedBy,
      overrideReason: schema.cashierSession.overrideReason,
      notes: schema.cashierSession.notes,
      userName: schema.user.name,
      userEmail: schema.user.email,
      locationName: schema.location.name,
    })
    .from(schema.cashierSession)
    .leftJoin(schema.user, eq(schema.cashierSession.userId, schema.user.id))
    .leftJoin(schema.location, eq(schema.cashierSession.locationId, schema.location.id))
    .where(
      membership.role === 'CASHIER'
        ? and(
            eq(schema.cashierSession.tenantId, tenantId),
            eq(schema.cashierSession.userId, userId)
          )
        : eq(schema.cashierSession.tenantId, tenantId)
    )
    .orderBy(
      desc(schema.cashierSession.businessDate),
      desc(schema.cashierSession.openedAt)
    )

  return history.map((session) => ({
    ...session,
    businessDate: toBusinessDateString(session.businessDate),
  }))
}

export async function getCashierSessionDetails(sessionId: string) {
  const userId = await getUserId()
  const membership = await requireRole(userId, ['ADMIN', 'MANAGER', 'CASHIER'])
  const tenantId = await getTenantId(userId)

  const conditions = [
    eq(schema.cashierSession.id, sessionId),
    eq(schema.cashierSession.tenantId, tenantId),
  ]
  if (membership.role === 'CASHIER') {
    conditions.push(eq(schema.cashierSession.userId, userId))
  }

  const sessions = await db
    .select()
    .from(schema.cashierSession)
    .where(and(...conditions))
    .limit(1)

  if (!sessions.length) throw new Error('Sesión de caja no encontrada.')
  return await buildSessionZReportData(sessions[0])
}

