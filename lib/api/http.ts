// Helpers de rutas API (Fase 3.22 — §"lib/api/http").
// withAuth: sesión + tenant resueltos de una forma; jsonError: AppError → HTTP;
// parseJsonBody/parseQueryParams: validación zod tipada.
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AppError, toErrorResponse } from '@/lib/errors'
import { unauthorizedError, tenantNotAssignedError } from '@/lib/auth/errors'

export async function requireApiSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw unauthorizedError()
  return session.user
}

export async function requireApiTenantId(userId: string): Promise<string> {
  const memberships = await db
    .select({ tenantId: schema.userTenant.tenantId })
    .from(schema.userTenant)
    .where(
      and(
        eq(schema.userTenant.userId, userId),
        eq(schema.userTenant.status, 'ACTIVE')
      )
    )
    .limit(1)

  if (!memberships.length) {
    const anyMembership = await db
      .select({ id: schema.userTenant.id })
      .from(schema.userTenant)
      .where(eq(schema.userTenant.userId, userId))
      .limit(1)
    if (anyMembership.length) {
      throw new AppError('TENANT_SUSPENDED', 'La membresía del usuario no está activa.')
    }
    throw tenantNotAssignedError()
  }
  return memberships[0].tenantId
}

/** Serializa cualquier error a JSON con el status de AppError. */
export function jsonError(error: unknown): NextResponse {
  const { status, body } = toErrorResponse(error)
  return NextResponse.json(body, { status })
}

/** Parsea el body con un schema zod; lanza AppError VALIDATION_ERROR (422). */
export async function parseJsonBody<T extends z.ZodType>(request: Request, schema_: T): Promise<z.infer<T>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw new AppError('BAD_REQUEST', 'Body JSON inválido o vacío.')
  }
  const result = schema_.safeParse(raw)
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', 'El cuerpo de la petición no es válido.', {
      details: result.error.issues.map((i) => ({ field: i.path.join('.'), issue: i.message })),
    })
  }
  return result.data
}

/** Parsea los query params con un schema zod; lanza AppError VALIDATION_ERROR (422). */
export function parseQueryParams<T extends z.ZodType>(request: Request, schema_: T): z.infer<T> {
  const url = new URL(request.url)
  const raw = Object.fromEntries(url.searchParams.entries())
  const result = schema_.safeParse(raw)
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', 'Los parámetros de consulta no son válidos.', {
      details: result.error.issues.map((i) => ({ field: i.path.join('.'), issue: i.message })),
    })
  }
  return result.data
}
