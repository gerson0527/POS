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
import {
  canManageInvoiceTax,
  canManageUsers,
  homePathForRole,
  isPathAllowedForRole,
  isPlatformAdminEmail,
  ALL_ROLES,
} from '@/lib/auth/permissions'

/**
 * Contexto de acceso del usuario autenticado: rol, ruta de inicio y
 * permisos de facturación. Lo consume el layout del dashboard para ocultar
 * la navegación que no corresponde al rol y para bloquear el acceso directo
 * a rutas no autorizadas.
 */
export async function getMyAccess() {
  const userId = await getUserId()
  const membership = await requireMembership(userId)
  const userRows = await db
    .select({ email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1)
  const isPlatformAdmin = isPlatformAdminEmail(userRows[0]?.email)
  return {
    role: membership.role,
    homePath: homePathForRole(membership.role),
    canManageInvoiceTax: canManageInvoiceTax(membership.role),
    canManageUsers: canManageUsers(membership.role),
    isPlatformAdmin,
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
  // Solo ADMIN puede crear/cambiar operadores (no MANAGER ni otros).
  const membership = await requireRole(currentUserId, ['ADMIN'])
  if (!canManageUsers(membership.role)) {
    throw new Error('Solo el administrador puede gestionar usuarios.')
  }
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

const ASSIGNABLE_ROLES = ['ADMIN', 'MANAGER', 'CASHIER', 'VIEWER', 'ACCOUNTANT'] as const

async function assertCanManageUsers() {
  const currentUserId = await getUserId()
  const membership = await requireRole(currentUserId, ['ADMIN'])
  if (!canManageUsers(membership.role)) {
    throw new Error('Solo el administrador puede gestionar usuarios.')
  }
  const tenantId = await getTenantId(currentUserId)
  return { currentUserId, tenantId }
}

async function countActiveAdmins(tenantId: string, excludeUserId?: string) {
  const rows = await db
    .select({ userId: schema.userTenant.userId })
    .from(schema.userTenant)
    .where(
      and(
        eq(schema.userTenant.tenantId, tenantId),
        eq(schema.userTenant.role, 'ADMIN'),
        eq(schema.userTenant.status, 'ACTIVE')
      )
    )
  return rows.filter((r) => r.userId !== excludeUserId).length
}

/** Actualiza nombre, rol y/o contraseña de un operador del tenant. */
export async function updateUserAction(input: {
  userId: string
  name?: string
  role?: string
  password?: string
}) {
  const { currentUserId, tenantId } = await assertCanManageUsers()
  const targetUserId = input.userId?.trim()
  if (!targetUserId) throw new Error('Usuario no indicado.')

  const membershipRows = await db
    .select({
      id: schema.userTenant.id,
      role: schema.userTenant.role,
      status: schema.userTenant.status,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.userTenant)
    .innerJoin(schema.user, eq(schema.user.id, schema.userTenant.userId))
    .where(
      and(
        eq(schema.userTenant.userId, targetUserId),
        eq(schema.userTenant.tenantId, tenantId),
        eq(schema.userTenant.status, 'ACTIVE')
      )
    )
    .limit(1)

  const target = membershipRows[0]
  if (!target) throw new Error('Usuario no encontrado en esta empresa.')

  // Un ADMIN no puede modificar a otro ADMIN (sí puede editarse a sí mismo).
  if (target.role === 'ADMIN' && targetUserId !== currentUserId) {
    throw new Error('Un administrador no puede modificar a otro administrador.')
  }

  const name = input.name?.trim()
  const role = input.role ? input.role.trim().toUpperCase() : undefined
  const password = input.password?.trim() || ''

  if (role && !ASSIGNABLE_ROLES.includes(role as (typeof ASSIGNABLE_ROLES)[number])) {
    throw new Error('Rol de usuario inválido.')
  }

  // Un ADMIN no puede bajarse el rol a sí mismo.
  if (
    targetUserId === currentUserId &&
    target.role === 'ADMIN' &&
    role &&
    role !== 'ADMIN'
  ) {
    throw new Error('No puede bajarse de administrador usted mismo.')
  }

  if (
    role &&
    target.role === 'ADMIN' &&
    role !== 'ADMIN' &&
    (await countActiveAdmins(tenantId, targetUserId)) < 1
  ) {
    throw new Error('No puede quitar el rol ADMIN al único administrador activo.')
  }

  if (password && password.length < 12) {
    throw new Error('La contraseña debe tener al menos 12 caracteres.')
  }

  await db.transaction(async (tx) => {
    if (name) {
      await tx
        .update(schema.user)
        .set({ name, updatedAt: new Date() })
        .where(eq(schema.user.id, targetUserId))
    }
    if (role && role !== target.role) {
      await tx
        .update(schema.userTenant)
        .set({ role })
        .where(eq(schema.userTenant.id, target.id))
    }
    if (password) {
      const passwordHash = await hashPassword(password)
      const accounts = await tx
        .select({ id: schema.account.id })
        .from(schema.account)
        .where(
          and(
            eq(schema.account.userId, targetUserId),
            eq(schema.account.providerId, 'credential')
          )
        )
        .limit(1)
      if (accounts[0]) {
        await tx
          .update(schema.account)
          .set({ password: passwordHash })
          .where(eq(schema.account.id, accounts[0].id))
      } else {
        await tx.insert(schema.account).values({
          id: `acc_${Date.now()}`,
          accountId: target.email,
          providerId: 'credential',
          userId: targetUserId,
          password: passwordHash,
        })
      }
    }
  })

  await logAudit(tenantId, currentUserId, AuditAction.UPDATE, 'user', targetUserId, {
    name: name || target.name,
    email: target.email,
    previousRole: target.role,
    role: role || target.role,
    passwordChanged: Boolean(password),
  })
  revalidatePath('/dashboard/users')
  return { success: true }
}

/** Desactiva (soft) un operador del tenant. No elimina el registro de auth. */
export async function deactivateUserAction(userId: string) {
  const { currentUserId, tenantId } = await assertCanManageUsers()
  const targetUserId = userId?.trim()
  if (!targetUserId) throw new Error('Usuario no indicado.')
  if (targetUserId === currentUserId) {
    throw new Error('No puede desactivarse a usted mismo.')
  }

  const membershipRows = await db
    .select({
      id: schema.userTenant.id,
      role: schema.userTenant.role,
      email: schema.user.email,
      name: schema.user.name,
    })
    .from(schema.userTenant)
    .innerJoin(schema.user, eq(schema.user.id, schema.userTenant.userId))
    .where(
      and(
        eq(schema.userTenant.userId, targetUserId),
        eq(schema.userTenant.tenantId, tenantId),
        eq(schema.userTenant.status, 'ACTIVE')
      )
    )
    .limit(1)

  const target = membershipRows[0]
  if (!target) throw new Error('Usuario no encontrado en esta empresa.')

  if (target.role === 'ADMIN') {
    throw new Error('Un administrador no puede desactivar a otro administrador.')
  }

  await db
    .update(schema.userTenant)
    .set({ status: 'INACTIVE' })
    .where(eq(schema.userTenant.id, target.id))

  await logAudit(tenantId, currentUserId, AuditAction.DELETE, 'user', targetUserId, {
    name: target.name,
    email: target.email,
    role: target.role,
    status: 'INACTIVE',
  })
  revalidatePath('/dashboard/users')
  return { success: true }
}

