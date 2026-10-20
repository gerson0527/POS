'use server'

import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { AuditAction } from '@/lib/types'
import { and, desc, eq } from 'drizzle-orm'
import crypto from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getTenantId, getUserId, logAudit, requireRole } from './_shared'

const ALLOWED_SCOPES = ['read', 'write'] as const
const WINDOW_PATTERN = /^(\d+)([smhd])$/

export async function listApiKeys() {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN'])
  const tenantId = await getTenantId(userId)

  return db
    .select({
      id: schema.apiKey.id,
      name: schema.apiKey.name,
      keyPrefix: schema.apiKey.keyPrefix,
      rateLimit: schema.apiKey.rateLimit,
      rateLimitWindow: schema.apiKey.rateLimitWindow,
      scopes: schema.apiKey.scopes,
      status: schema.apiKey.status,
      lastUsedAt: schema.apiKey.lastUsedAt,
      createdAt: schema.apiKey.createdAt,
      expiresAt: schema.apiKey.expiresAt,
    })
    .from(schema.apiKey)
    .where(eq(schema.apiKey.tenantId, tenantId))
    .orderBy(desc(schema.apiKey.createdAt))
}

export async function createApiKey(input: {
  name: string
  scopes?: string[]
  rateLimit?: number
  rateLimitWindow?: string
  expiresAt?: string
}) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN'])
  const tenantId = await getTenantId(userId)

  const name = String(input.name || '').trim()
  if (!name) throw new Error('El nombre de la API key es obligatorio.')
  if (name.length > 100) throw new Error('El nombre no puede superar 100 caracteres.')

  const scopes = Array.from(
    new Set(
      (input.scopes || ['read'])
        .map((scope) => String(scope).trim().toLowerCase())
        .filter(Boolean)
    )
  )
  if (!scopes.length) throw new Error('Seleccione al menos un permiso.')
  if (scopes.some((scope) => !ALLOWED_SCOPES.includes(scope as (typeof ALLOWED_SCOPES)[number]))) {
    throw new Error('Permiso de API inválido.')
  }

  const rateLimit = Number(input.rateLimit ?? 1000)
  if (!Number.isInteger(rateLimit) || rateLimit < 1 || rateLimit > 100_000) {
    throw new Error('El límite de peticiones debe estar entre 1 y 100000.')
  }

  const rateLimitWindow = String(input.rateLimitWindow || '1h').trim().toLowerCase()
  if (!WINDOW_PATTERN.test(rateLimitWindow)) {
    throw new Error('La ventana debe usar el formato 30s, 5m, 1h o 1d.')
  }

  let expiresAt: Date | null = null
  if (input.expiresAt) {
    expiresAt = new Date(input.expiresAt)
    if (Number.isNaN(expiresAt.getTime())) throw new Error('Fecha de expiración inválida.')
    if (expiresAt.getTime() <= Date.now()) {
      throw new Error('La fecha de expiración debe ser futura.')
    }
  }

  const active = await db
    .select({ id: schema.apiKey.id })
    .from(schema.apiKey)
    .where(and(eq(schema.apiKey.tenantId, tenantId), eq(schema.apiKey.status, 'ACTIVE')))

  if (active.length >= 20) {
    throw new Error('Se alcanzó el máximo de 20 API keys activas. Revoque una antes de crear otra.')
  }

  const prefix = `pk_${crypto.randomBytes(6).toString('hex')}`
  const secret = crypto.randomBytes(24).toString('base64url')
  const keyHash = crypto.createHash('sha256').update(secret).digest('hex')
  const id = `ak_${crypto.randomUUID()}`

  await db.insert(schema.apiKey).values({
    id,
    tenantId,
    name,
    keyHash,
    keyPrefix: prefix,
    rateLimit,
    rateLimitWindow,
    scopes: scopes.join(','),
    status: 'ACTIVE',
    expiresAt,
  })

  await logAudit(tenantId, userId, AuditAction.CREATE, 'api_key', id, {
    name,
    keyPrefix: prefix,
    scopes,
    rateLimit,
    rateLimitWindow,
    expiresAt,
  })

  revalidatePath('/dashboard/settings')

  return {
    success: true,
    id,
    key: `${prefix}.${secret}`,
  }
}

export async function revokeApiKey(apiKeyId: string) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN'])
  const tenantId = await getTenantId(userId)

  const updated = await db
    .update(schema.apiKey)
    .set({ status: 'REVOKED' })
    .where(
      and(
        eq(schema.apiKey.id, apiKeyId),
        eq(schema.apiKey.tenantId, tenantId)
      )
    )
    .returning({ id: schema.apiKey.id })

  if (!updated.length) throw new Error('API key no encontrada.')

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'api_key', apiKeyId, {
    status: 'REVOKED',
  })

  revalidatePath('/dashboard/settings')
  return { success: true }
}
