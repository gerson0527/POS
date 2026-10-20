'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { AuditAction } from '@/lib/types'
import { and, eq, desc, asc, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUserId, getTenantId, logAudit, requireRole } from './_shared'
export async function getCustomers(includeInactive = true) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const whereClause = includeInactive
    ? eq(schema.customer.tenantId, tenantId)
    : and(eq(schema.customer.tenantId, tenantId), eq(schema.customer.status, 'ACTIVE'))

  const rows = await db
    .select()
    .from(schema.customer)
    .where(whereClause)
    .orderBy(asc(schema.customer.name))

  return rows
}

export async function createCustomer(input: {
  documentType: string
  documentNumber: string
  name: string
  personType?: string
  tradeName?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  department?: string
  taxRegime?: string
  notes?: string
}) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER', 'CASHIER'])
  const tenantId = await getTenantId(userId)

  const docNumber = input.documentNumber.trim()
  const existing = await db
    .select({ id: schema.customer.id })
    .from(schema.customer)
    .where(
      and(
        eq(schema.customer.tenantId, tenantId),
        eq(schema.customer.documentNumber, docNumber)
      )
    )
    .limit(1)

  if (existing.length) {
    throw new Error(`Ya existe un cliente con documento ${docNumber}`)
  }

  const id = `cust_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

  await db.insert(schema.customer).values({
    id,
    tenantId,
    documentType: input.documentType,
    documentNumber: docNumber,
    personType: input.personType || (input.documentType === 'NIT' ? 'JURIDICA' : 'NATURAL'),
    name: input.name.trim(),
    tradeName: input.tradeName?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    department: input.department?.trim() || null,
    taxRegime: input.taxRegime || null,
    notes: input.notes?.trim() || null,
    status: 'ACTIVE',
  })

  await logAudit(tenantId, userId, AuditAction.CREATE, 'customer', id, { name: input.name, documentNumber: docNumber })

  revalidatePath('/dashboard/customers')
  return { id, success: true }
}

export async function updateCustomer(
  id: string,
  input: {
    documentType?: string
    documentNumber?: string
    name?: string
    personType?: string
    tradeName?: string
    email?: string
    phone?: string
    address?: string
    city?: string
    department?: string
    taxRegime?: string
    notes?: string
  }
) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER', 'CASHIER'])
  const tenantId = await getTenantId(userId)

  const updateData: any = { updatedAt: new Date() }
  if (input.documentType !== undefined) updateData.documentType = input.documentType
  if (input.documentNumber !== undefined) updateData.documentNumber = input.documentNumber.trim()
  if (input.name !== undefined) updateData.name = input.name.trim()
  if (input.personType !== undefined) updateData.personType = input.personType
  if (input.tradeName !== undefined) updateData.tradeName = input.tradeName?.trim() || null
  if (input.email !== undefined) updateData.email = input.email?.trim() || null
  if (input.phone !== undefined) updateData.phone = input.phone?.trim() || null
  if (input.address !== undefined) updateData.address = input.address?.trim() || null
  if (input.city !== undefined) updateData.city = input.city?.trim() || null
  if (input.department !== undefined) updateData.department = input.department?.trim() || null
  if (input.taxRegime !== undefined) updateData.taxRegime = input.taxRegime || null
  if (input.notes !== undefined) updateData.notes = input.notes?.trim() || null

  await db
    .update(schema.customer)
    .set(updateData)
    .where(and(eq(schema.customer.id, id), eq(schema.customer.tenantId, tenantId)))

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'customer', id, updateData)

  revalidatePath('/dashboard/customers')
  return { id, success: true }
}

export async function toggleCustomerStatus(id: string) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER', 'CASHIER'])
  const tenantId = await getTenantId(userId)

  const row = await db
    .select()
    .from(schema.customer)
    .where(and(eq(schema.customer.id, id), eq(schema.customer.tenantId, tenantId)))
    .limit(1)

  if (!row.length) throw new Error('Cliente no encontrado')

  const newStatus = row[0].status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'

  await db
    .update(schema.customer)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(schema.customer.id, id))

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'customer', id, { status: newStatus })

  revalidatePath('/dashboard/customers')
  return { id, status: newStatus, success: true }
}

export async function deleteCustomer(id: string) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER'])
  const tenantId = await getTenantId(userId)

  const used = await db
    .select({ id: schema.sale.id })
    .from(schema.sale)
    .where(and(eq(schema.sale.tenantId, tenantId), eq(schema.sale.customerDocNumber,
      (await db.select({ documentNumber: schema.customer.documentNumber }).from(schema.customer).where(eq(schema.customer.id, id)).limit(1))[0]?.documentNumber || '__none__'
    )))
    .limit(1)

  if (used.length) {
    throw new Error('No se puede eliminar: el cliente tiene ventas registradas. Inactívalo en su lugar.')
  }

  await db
    .delete(schema.customer)
    .where(and(eq(schema.customer.id, id), eq(schema.customer.tenantId, tenantId)))

  await logAudit(tenantId, userId, AuditAction.DELETE, 'customer', id, {})

  revalidatePath('/dashboard/customers')
  return { id, success: true }
}

// CUSTOMER CREDIT (MORA / CRÉDITO)
export async function setCustomerCreditLimit(customerId: string, limit: number) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER'])
  const tenantId = await getTenantId(userId)

  await db
    .update(schema.customer)
    .set({
      creditEnabled: limit > 0 ? 'SI' : 'NO',
      creditLimit: String(limit),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.customer.id, customerId), eq(schema.customer.tenantId, tenantId)))

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'customer', customerId, { creditLimit: limit })

  revalidatePath('/dashboard/customers')
  return { id: customerId, creditLimit: limit, success: true }
}

export async function toggleCustomerCredit(customerId: string) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER'])
  const tenantId = await getTenantId(userId)

  const row = await db
    .select()
    .from(schema.customer)
    .where(and(eq(schema.customer.id, customerId), eq(schema.customer.tenantId, tenantId)))
    .limit(1)

  if (!row.length) throw new Error('Cliente no encontrado')

  const next = row[0].creditEnabled === 'SI' ? 'NO' : 'SI'
  await db
    .update(schema.customer)
    .set({ creditEnabled: next, updatedAt: new Date() })
    .where(eq(schema.customer.id, customerId))

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'customer', customerId, { creditEnabled: next })

  revalidatePath('/dashboard/customers')
  return { id: customerId, creditEnabled: next, success: true }
}

export async function chargeCustomerCredit(input: {
  customerId: string
  amount: number
  note?: string
  saleId?: string
  dueDate?: string
}) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER', 'CASHIER'])
  const tenantId = await getTenantId(userId)

  const requested = Number(input.amount)
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new Error('El valor del cargo debe ser mayor a cero.')
  }
  const amount = Math.round(requested * 100) / 100

  const result = await db.transaction(async (tx) => {
    const cust = await tx
      .select()
      .from(schema.customer)
      .where(
        and(
          eq(schema.customer.id, input.customerId),
          eq(schema.customer.tenantId, tenantId)
        )
      )
      .limit(1)
      .for('update')

    if (!cust.length) throw new Error('Cliente no encontrado')

    const customer = cust[0]
    const balance = Number(customer.creditBalance || 0)
    const limit = Number(customer.creditLimit || 0)

    if (customer.creditEnabled !== 'SI') {
      throw new Error('El cliente no tiene crédito habilitado')
    }
    if (customer.creditStatus === 'BLOQUEADO') {
      throw new Error('El cliente tiene el crédito bloqueado')
    }
    if (limit > 0 && balance + amount > limit) {
      throw new Error(
        `Cupo insuficiente. Disponible: $${(limit - balance).toLocaleString('es-CO')}`
      )
    }

    const newBalance = Math.round((balance + amount) * 100) / 100
    const txId = `cct_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

    await tx.insert(schema.customerCreditTransaction).values({
      id: txId,
      tenantId,
      customerId: input.customerId,
      type: 'CHARGE',
      amount: String(amount),
      paidAmount: '0',
      balanceAfter: String(newBalance),
      saleId: input.saleId || null,
      note: input.note || null,
      dueDate: input.dueDate
        ? new Date(input.dueDate)
        : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      status: 'PENDIENTE',
    })

    await tx
      .update(schema.customer)
      .set({
        creditBalance: String(newBalance),
        creditStatus: newBalance > 0 ? customer.creditStatus || 'AL_DIA' : 'AL_DIA',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.customer.id, input.customerId),
          eq(schema.customer.tenantId, tenantId)
        )
      )

    return { txId, newBalance }
  })

  await logAudit(tenantId, userId, AuditAction.CREATE, 'credit', result.txId, {
    customerId: input.customerId,
    amount,
    saleId: input.saleId || null,
  })

  revalidatePath('/dashboard/customers')
  return { ...result, success: true }
}

export async function payCustomerCredit(input: {
  customerId: string
  amount: number
  paymentMethod?: string
  note?: string
}) {
  const userId = await getUserId()
  const membership = await requireRole(userId, ['ADMIN', 'MANAGER', 'CASHIER'])
  const tenantId = await getTenantId(userId)

  const requested = Number(input.amount)
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new Error('El valor del abono debe ser mayor a cero.')
  }
  const payment = Math.round(requested * 100) / 100
  const method = (input.paymentMethod || 'CASH').toUpperCase()

  const result = await db.transaction(async (tx) => {
    const cust = await tx
      .select()
      .from(schema.customer)
      .where(
        and(
          eq(schema.customer.id, input.customerId),
          eq(schema.customer.tenantId, tenantId)
        )
      )
      .limit(1)
      .for('update')

    if (!cust.length) throw new Error('Cliente no encontrado')
    const customer = cust[0]
    const balance = Math.round(Number(customer.creditBalance) * 100) / 100

    if (balance <= 0) throw new Error('El cliente no tiene saldo pendiente.')
    if (payment > balance) {
      throw new Error(`El abono no puede superar el saldo de $${balance.toFixed(2)}.`)
    }

    const newBalance = Math.round((balance - payment) * 100) / 100
    const txId = `cct_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

    await tx.insert(schema.customerCreditTransaction).values({
      id: txId,
      tenantId,
      customerId: input.customerId,
      type: 'PAYMENT',
      amount: String(payment),
      paidAmount: '0',
      balanceAfter: String(newBalance),
      note: input.note || null,
      status: 'PAGADO',
      paymentMethod: method,
    })

    const pending = await tx
      .select()
      .from(schema.customerCreditTransaction)
      .where(
        and(
          eq(schema.customerCreditTransaction.tenantId, tenantId),
          eq(schema.customerCreditTransaction.customerId, input.customerId),
          eq(schema.customerCreditTransaction.type, 'CHARGE'),
          sql`${schema.customerCreditTransaction.status} IN ('PENDIENTE', 'VENCIDO')`
        )
      )
      .orderBy(asc(schema.customerCreditTransaction.createdAt))
      .for('update')

    let remaining = payment
    for (const charge of pending) {
      if (remaining <= 0) break
      const chargeAmount = Math.round(Number(charge.amount) * 100) / 100
      const alreadyPaid = Math.round(Number(charge.paidAmount) * 100) / 100
      const outstanding = Math.max(0, Math.round((chargeAmount - alreadyPaid) * 100) / 100)
      if (outstanding <= 0) continue

      const applied = Math.min(remaining, outstanding)
      const newPaid = Math.round((alreadyPaid + applied) * 100) / 100
      remaining = Math.round((remaining - applied) * 100) / 100

      await tx
        .update(schema.customerCreditTransaction)
        .set({
          paidAmount: String(newPaid),
          status: newPaid >= chargeAmount ? 'PAGADO' : charge.status,
        })
        .where(
          and(
            eq(schema.customerCreditTransaction.id, charge.id),
            eq(schema.customerCreditTransaction.tenantId, tenantId)
          )
        )
    }

    await tx
      .update(schema.customer)
      .set({
        creditBalance: String(newBalance),
        creditStatus: newBalance > 0 ? customer.creditStatus : 'AL_DIA',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.customer.id, input.customerId),
          eq(schema.customer.tenantId, tenantId)
        )
      )

    let cashMovementId: string | null = null
    if (method === 'CASH' || method === 'EFECTIVO') {
      const sessionConditions = [
        eq(schema.cashierSession.tenantId, tenantId),
        eq(schema.cashierSession.status, 'OPEN'),
      ]
      if (membership.role === 'CASHIER') {
        sessionConditions.push(eq(schema.cashierSession.userId, userId))
      }

      const openSession = await tx
        .select({ id: schema.cashierSession.id })
        .from(schema.cashierSession)
        .where(and(...sessionConditions))
        .orderBy(desc(schema.cashierSession.openedAt))
        .limit(1)

      if (!openSession.length) {
        throw new Error('No hay una caja abierta para registrar el abono en efectivo.')
      }

      cashMovementId = `cm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
      await tx.insert(schema.cashMovement).values({
        id: cashMovementId,
        tenantId,
        cashierSessionId: openSession[0].id,
        type: 'INGRESO',
        concept: `Abono crédito cliente ${customer.name}`.slice(0, 160),
        amount: String(payment),
        note: input.note || null,
        createdBy: userId,
      })
    }

    return { txId, newBalance, cashMovementId }
  })

  await logAudit(tenantId, userId, AuditAction.CREATE, 'credit', result.txId, {
    customerId: input.customerId,
    amount: payment,
    paymentMethod: method,
    cashMovementId: result.cashMovementId,
  })

  revalidatePath('/dashboard/customers')
  if (result.cashMovementId) {
    revalidatePath('/dashboard/pos')
    revalidatePath('/dashboard/cashier')
    revalidatePath('/dashboard/cash-closure')
  }
  return { ...result, settled: payment, success: true }
}

export async function getCustomerCreditDetail(customerId: string) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const cust = await db
    .select()
    .from(schema.customer)
    .where(and(eq(schema.customer.id, customerId), eq(schema.customer.tenantId, tenantId)))
    .limit(1)

  if (!cust.length) throw new Error('Cliente no encontrado')

  // Mark overdue transactions
  await db
    .update(schema.customerCreditTransaction)
    .set({ status: 'VENCIDO' })
    .where(
      and(
        eq(schema.customerCreditTransaction.customerId, customerId),
        eq(schema.customerCreditTransaction.status, 'PENDIENTE'),
        sql`${schema.customerCreditTransaction.dueDate} < NOW()`
      )
    )

  // Refresh after status update
  const txRefreshed = await db
    .select()
    .from(schema.customerCreditTransaction)
    .where(eq(schema.customerCreditTransaction.customerId, customerId))
    .orderBy(desc(schema.customerCreditTransaction.createdAt))
    .limit(100)

  // Determine aggregate credit status
  const hasOverdue = txRefreshed.some((t) => t.status === 'VENCIDO')
  const newStatus = hasOverdue ? 'EN_MORA' : cust[0].creditStatus === 'BLOQUEADO' ? 'BLOQUEADO' : 'AL_DIA'

  if (newStatus !== cust[0].creditStatus) {
    await db
      .update(schema.customer)
      .set({ creditStatus: newStatus, updatedAt: new Date() })
      .where(eq(schema.customer.id, customerId))
  }

  return {
    customer: { ...cust[0], creditStatus: newStatus },
    transactions: txRefreshed,
    available: Math.max(0, Number(cust[0].creditLimit) - Number(cust[0].creditBalance)),
  }
}

export async function setCustomerCreditStatus(customerId: string, status: 'AL_DIA' | 'BLOQUEADO') {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER'])
  const tenantId = await getTenantId(userId)

  await db
    .update(schema.customer)
    .set({ creditStatus: status, updatedAt: new Date() })
    .where(and(eq(schema.customer.id, customerId), eq(schema.customer.tenantId, tenantId)))

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'customer', customerId, { creditStatus: status })

  revalidatePath('/dashboard/customers')
  return { id: customerId, creditStatus: status, success: true }
}

export async function getOverdueCustomers() {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const rows = await db
    .select()
    .from(schema.customer)
    .where(
      and(
        eq(schema.customer.tenantId, tenantId),
        eq(schema.customer.creditEnabled, 'SI'),
        sql`${schema.customer.creditBalance} > 0`
      )
    )
    .orderBy(desc(schema.customer.creditBalance))

  // Filter in app layer for overdue transactions
  const result = []
  for (const c of rows) {
    const overdueCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.customerCreditTransaction)
      .where(
        and(
          eq(schema.customerCreditTransaction.customerId, c.id),
          eq(schema.customerCreditTransaction.status, 'VENCIDO')
        )
      )

    if (Number(overdueCount[0]?.count || 0) > 0 || c.creditStatus === 'EN_MORA') {
      result.push(c)
    }
  }
  return result
}

