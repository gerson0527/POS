'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { AuditAction } from '@/lib/types'
import { eq, desc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { sendWelcomeEmail } from '@/lib/email'
import { getUserId, getTenantId, logAudit } from './_shared'
export async function getUsersList() {
  const currentUserId = await getUserId()
  await getTenantId(currentUserId)

  const usersList = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      createdAt: schema.user.createdAt,
      role: schema.userTenant.role,
    })
    .from(schema.user)
    .leftJoin(schema.userTenant, eq(schema.user.id, schema.userTenant.userId))
    .orderBy(desc(schema.user.createdAt))

  return usersList.map((u) => ({
    id: u.id,
    name: u.name || 'Operador POS',
    email: u.email,
    role: u.role || 'CASHIER',
    createdAt: u.createdAt ? new Date(u.createdAt).toISOString().split('T')[0] : '2026-07-27',
    isCurrent: u.id === currentUserId,
  }))
}

export async function createUserAction(input: {
  name: string
  email: string
  password?: string
  role?: string
}) {
  const currentUserId = await getUserId()
  const tenantId = await getTenantId(currentUserId)

  const existing = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, input.email))
    .limit(1)

  if (existing.length > 0) {
    throw new Error('El correo electrónico ya se encuentra registrado.')
  }

  const userId = `usr_${Date.now()}`

  await db.insert(schema.user).values({
    id: userId,
    name: input.name,
    email: input.email,
    emailVerified: true,
  })

  await db.insert(schema.account).values({
    id: `acc_${Date.now()}`,
    accountId: input.email,
    providerId: 'credential',
    userId,
    password: input.password || '12345678',
  })

  await db.insert(schema.userTenant).values({
    id: `ut_${Date.now()}`,
    userId,
    tenantId,
    role: input.role || 'CASHIER',
    status: 'ACTIVE',
  })

  try {
    await sendWelcomeEmail(input.email, input.name, input.role || 'CASHIER')
  } catch (emailErr) {
    console.error('Error enviando correo de bienvenida:', emailErr)
  }

  await logAudit(tenantId, currentUserId, AuditAction.CREATE, 'user', userId, { name: input.name, email: input.email, role: input.role })
  revalidatePath('/dashboard/users')
  return { success: true, userId }
}

