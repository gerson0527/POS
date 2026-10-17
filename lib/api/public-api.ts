'use server'

import { db } from '@/lib/db'
import { apiKey } from '@/lib/db/schema'
import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { rateLimitedError } from '@/lib/errors'

export async function validateAPIKey(
  key: string
): Promise<{ valid: boolean; tenantId?: string; scopes?: string[] }> {
  const [prefix, secret] = key.split('.')
  if (!prefix || !secret) {
    return { valid: false }
  }

  const keyHash = crypto.createHash('sha256').update(secret).digest('hex')

  const record = await db
    .select()
    .from(apiKey)
    .where(eq(apiKey.keyHash, keyHash))
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

  // Rate limit persistente (H-4): contador en BD (sobrevive a serverless), no en memoria.
  const windowMs = 60 * 60 * 1000 // 1 hora
  const rate = await checkRateLimit(
    `apikey:${key_record.id}`,
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
