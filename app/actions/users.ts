'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { AuditAction } from '@/lib/types'
import { and, eq, desc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { sendWelcomeEmail } from '@/lib/email'
import { hashPassword } from 'better-auth/crypto'
import { getUserId, getTenantId, logAudit, requireRole } from './_shared'
import { requireMembership } from '@/lib/auth/session-context'
import { canManageInvoiceTax, homePathForRole, isPathAllowedForRole, ALL_ROLES } from '@/lib/auth/permissions'

/**
 * Contexto de acceso del usuario autenticado: rol, ruta de inicio y
 * permisos de facturación. Lo consume el layout del dashboard para ocultar
 * la navegación que no corresponde al rol y para bloquear el acceso directo
 * a rutas no autorizadas.
 */
export async function getMyAccess() {
  const userId = await getUserId()
  const membership = await requireMembership(userId)
  return {
    role: membership.role,
    homePath: homePathForRole(membership.role),
    canManageInvoiceTax: canManageInvoiceTax(membership.role),
    allowedPathPrefixes: membership.role === 'ACCOUNTANT' ? ['/dashboard/invoices'] : ['/dashboard'],
  }
}

/** Verifica (en servidor) si el usuario actual puede entrar a una ruta del dashboard. */
export async function canAccessPath(pathname: string) {
  const userId = await getUserId()
  const membership = await requireMembership(userId)
  return isPathAllowedForRole(membership.role, pathname)
}

export async function getUsersList() {
  const currentUserId = await getUserId()
  await requireRole(currentUserId, ALL_ROLES)
  const tenantId = await getTenantId(currentUserId)

  const usersList = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      createdAt: schema.user.createdAt,
      role: schema.userTenant.role,
    })
    .from(schema.userTenant)
    .innerJoin(schema.user, eq(schema.user.id, schema.userTenant.userId))
    .where(
      and(
        eq(schema.userTenant.tenantId, tenantId),
        eq(schema.userTenant.status, 'ACTIVE')
      )
    )
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
  await requireRole(currentUserId, ['ADMIN'])
  const tenantId = await getTenantId(currentUserId)

  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  const password = input.password || ''
  const role = (input.role || 'CASHIER').toUpperCase()

  if (!name) throw new Error('El nombre del usuario es obligatorio.')
  if (!email) throw new Error('El correo del usuario es obligatorio.')
  if (password.length < 12) {
    throw new Error('La contraseña debe tener al menos 12 caracteres.')
  }
  if (!['ADMIN', 'MANAGER', 'CASHIER', 'VIEWER', 'ACCOUNTANT'].includes(role)) {
    throw new Error('Rol de usuario inválido.')
  }

  const existing = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1)

  if (existing.length > 0) {
    throw new Error('El correo electrónico ya se encuentra registrado.')
  }

  const userId = `usr_${Date.now()}`
  const passwordHash = await hashPassword(password)

  await db.transaction(async (tx) => {
    await tx.insert(schema.user).values({
      id: userId,
      name,
      email,
      emailVerified: true,
    })

    await tx.insert(schema.account).values({
      id: `acc_${Date.now()}`,
      accountId: email,
      providerId: 'credential',
      userId,
      password: passwordHash,
    })

    await tx.insert(schema.userTenant).values({
      id: `ut_${Date.now()}`,
      userId,
      tenantId,
      role,
      status: 'ACTIVE',
    })
  })

  try {
    await sendWelcomeEmail(email, name, role)
  } catch (emailErr) {
    console.error('Error enviando correo de bienvenida:', emailErr)
  }

  await logAudit(tenantId, currentUserId, AuditAction.CREATE, 'user', userId, {
    name,
    email,
    role,
  })
  revalidatePath('/dashboard/users')
  return { success: true, userId }
}

