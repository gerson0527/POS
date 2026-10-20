'use server'

import { db } from '@/lib/db'
import { apiKey } from '@/lib/db/schema'
import crypto from 'crypto'
import { and, eq } from 'drizzle-orm'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { rateLimitedError } from '@/lib/errors'

function parseRateWindow(value: string | null | undefined): number {
  const raw = (value || '1h').trim().toLowerCase()
  const match = /^(\d+)\s*([smhd])$/.exec(raw)
  if (!match) return 60 * 60 * 1000
  const amount = Number(match[1])
  const unit = match[2]
  const multiplier =
    unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'd' ? 86_400_000 : 3_600_000
  return Math.max(1000, amount * multiplier)
}

export async function validateAPIKey(
  key: string
): Promise<{ valid: boolean; tenantId?: string; scopes?: string[] }> {
  const separator = key.indexOf('.')
  if (separator <= 0) return { valid: false }
  const prefix = key.slice(0, separator)
  const secret = key.slice(separator + 1)
  if (!prefix || secret.length < 16) {
    return { valid: false }
  }

  const keyHash = crypto.createHash('sha256').update(secret).digest('hex')

  const record = await db
    .select()
    .from(apiKey)
    .where(and(eq(apiKey.keyHash, keyHash), eq(apiKey.keyPrefix, prefix)))
    .limit(1)

  if (!record.length) {
    return { valid: false }
  }

  const key_record = record[0]

  // Clave revocada/inactiva.
  if (key_record.status && key_record.status !== 'ACTIVE') {
    return { valid: false }
  }

  // Check expiration
  if (key_record.expiresAt && new Date(key_record.expiresAt) < new Date()) {
    return { valid: false }
  }

  // Rate limit persistente (H-4), con la ventana configurada en la clave.
  const windowMs = parseRateWindow(key_record.rateLimitWindow)
  const rate = await checkRateLimit(
    `apikey:${key_record.id}:${windowMs}`,
    key_record.rateLimit || 1000,
    windowMs
  )
  if (!rate.allowed) {
    throw rateLimitedError(
      `Límite de peticiones excedido (${rate.count}/${rate.limit}). Reintenta en ${rate.retryAfterSeconds}s.`
    )
  }

  // Update last used
  await db
    .update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, key_record.id))

  return {
    valid: true,
    tenantId: key_record.tenantId,
    scopes: key_record.scopes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  }
}
