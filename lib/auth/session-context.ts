// Resolución de sesión/tenant/rol en una sola forma (Fase 3.19 — §"session-context").
// Antes: resuelta ~5 formas distintas repartidas por los actions.
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { cookies, headers } from 'next/headers'
import { forbiddenError, tenantNotAssignedError, tenantSuspendedError, unauthorizedError } from './errors'

export type TenantRole = 'ADMIN' | 'CASHIER' | 'MANAGER' | 'VIEWER'

export interface TenantMembership {
  tenantId: string
  role: TenantRole
}

/** Devuelve el id del usuario autenticado o lanza SessionError UNAUTHORIZED. */
export async function requireUser(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    throw unauthorizedError()
  }
  return session.user.id
}

/** Devuelve la membresía activa del usuario o lanza SessionError tipado. */
export async function requireMembership(userId: string): Promise<TenantMembership> {
  const memberships = await db
    .select()
    .from(schema.userTenant)
    .where(
      and(
        eq(schema.userTenant.userId, userId),
        eq(schema.userTenant.status, 'ACTIVE')
      )
    )

  // Seguridad: NUNCA crear la membresía automáticamente. Antes cualquier cuenta
  // sin vínculo obtenía role ADMIN en tenant_default (escalada de privilegios).
  // Las altas legales pasan por createUserAction / createTenantWithAdmin.
  if (!memberships.length) {
    const anyMembership = await db
      .select({ id: schema.userTenant.id })
      .from(schema.userTenant)
      .where(eq(schema.userTenant.userId, userId))
      .limit(1)
    if (anyMembership.length) throw tenantSuspendedError()
    throw tenantNotAssignedError()
  }

  const cookieStore = await cookies()
  const preferredTenantId = cookieStore.get('tenant_id')?.value
  const active =
    (preferredTenantId
      ? memberships.find((membership) => membership.tenantId === preferredTenantId)
      : undefined) || memberships[0]

  return { tenantId: active.tenantId, role: active.role as TenantRole }
}

/** Devuelve el tenant activo del usuario o lanza SessionError tipado. */
export async function requireTenantId(userId: string): Promise<string> {
  const membership = await requireMembership(userId)
  return membership.tenantId
}

/** Valida que el usuario tenga uno de los roles permitidos en su tenant activo. */
export async function requireRole(userId: string, allowed: TenantRole[]): Promise<TenantMembership> {
  const membership = await requireMembership(userId)
  if (!allowed.includes(membership.role)) {
    throw forbiddenError(
      `Se requiere uno de los roles: ${allowed.join(', ')}. Rol actual: ${membership.role}.`
    )
  }
  return membership
}
