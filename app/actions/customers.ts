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

  const cust = await db
    .select()
    .from(schema.customer)
    .where(and(eq(schema.customer.id, input.customerId), eq(schema.customer.tenantId, tenantId)))
    .limit(1)

  if (!cust.length) throw new Error('Cliente no encontrado')

  const customer = cust[0]

  if (customer.creditEnabled !== 'SI') {
    throw new Error('El cliente no tiene crédito habilitado')
  }
  if (customer.creditStatus === 'BLOQUEADO') {
    throw new Error('El cliente tiene el crédito bloqueado')
  }
  if (Number(customer.creditLimit) > 0 && Number(customer.creditBalance) + input.amount > Number(customer.creditLimit)) {
    throw new Error(`Cupo insuficiente. Disponible: $${(Number(customer.creditLimit) - Number(customer.creditBalance)).toLocaleString('es-CO')}`)
  }

  const newBalance = Number(customer.creditBalance) + input.amount
  const txId = `cct_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

  await db.insert(schema.customerCreditTransaction).values({
    id: txId,
    tenantId,
    customerId: input.customerId,
    type: 'CHARGE',
    amount: String(input.amount),
    balanceAfter: String(newBalance),
    saleId: input.saleId || null,
    note: input.note || null,
    dueDate: input.dueDate ? new Date(input.dueDate) : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    status: 'PENDIENTE',
  })

  await db
    .update(schema.customer)
    .set({
      creditBalance: String(newBalance),
      creditStatus: newBalance > 0 ? (customer.creditStatus || 'AL_DIA') : 'AL_DIA',
      updatedAt: new Date(),
    })
    .where(eq(schema.customer.id, input.customerId))

  await logAudit(tenantId, userId, AuditAction.CREATE, 'credit', txId, input)

  revalidatePath('/dashboard/customers')
  return { txId, newBalance, success: true }
}

export async function payCustomerCredit(input: {
  customerId: string
  amount: number
  paymentMethod?: string
  note?: string
}) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN', 'MANAGER', 'CASHIER'])
  const tenantId = await getTenantId(userId)

  const cust = await db
    .select()
    .from(schema.customer)
    .where(and(eq(schema.customer.id, input.customerId), eq(schema.customer.tenantId, tenantId)))
    .limit(1)

  if (!cust.length) throw new Error('Cliente no encontrado')

  const customer = cust[0]
  const payment = Math.min(Number(input.amount), Number(customer.creditBalance))
  const newBalance = Number(customer.creditBalance) - payment

  const txId = `cct_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

  await db.insert(schema.customerCreditTransaction).values({
    id: txId,
    tenantId,
    customerId: input.customerId,
    type: 'PAYMENT',
    amount: String(payment),
    balanceAfter: String(newBalance),
    note: input.note || null,
    status: 'PAGADO',
    paymentMethod: input.paymentMethod || 'CASH',
  })

  // Settle oldest pending charges first
  const pending = await db
    .select()
    .from(schema.customerCreditTransaction)
    .where(
      and(
        eq(schema.customerCreditTransaction.customerId, input.customerId),
        eq(schema.customerCreditTransaction.status, 'PENDIENTE'),
        eq(schema.customerCreditTransaction.type, 'CHARGE')
      )
    )
    .orderBy(asc(schema.customerCreditTransaction.createdAt))

  let remaining = payment
  for (const tx of pending) {
    if (remaining <= 0) break
    await db
      .update(schema.customerCreditTransaction)
      .set({ status: 'PAGADO' })
      .where(eq(schema.customerCreditTransaction.id, tx.id))
    remaining -= Number(tx.amount)
  }

  await db
    .update(schema.customer)
    .set({
      creditBalance: String(newBalance),
      creditStatus: newBalance > 0 ? customer.creditStatus : 'AL_DIA',
      updatedAt: new Date(),
    })
    .where(eq(schema.customer.id, input.customerId))

  await logAudit(tenantId, userId, AuditAction.CREATE, 'credit', txId, input)

  revalidatePath('/dashboard/customers')
  return { txId, newBalance, settled: payment, success: true }
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

