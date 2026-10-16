'use server'

import { db } from '@/lib/db'
import { apiKey } from '@/lib/db/schema'
import crypto from 'crypto'
import { eq } from 'drizzle-orm'

// Rate limiting store (in production, use Redis)
const rateLimitStore = new Map<string, Array<number>>()

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

  // Check expiration
  if (key_record.expiresAt && new Date(key_record.expiresAt) < new Date()) {
    return { valid: false }
  }

  // Check rate limit
  const now = Date.now()
  const windowMs = 60 * 60 * 1000 // 1 hour
  const windowStart = now - windowMs

  if (!rateLimitStore.has(key_record.id)) {
    rateLimitStore.set(key_record.id, [])
  }

  const requests = rateLimitStore.get(key_record.id) || []
  const recentRequests = requests.filter((time) => time > windowStart)

  if (recentRequests.length >= (key_record.rateLimit || 1000)) {
    return { valid: false }
  }

  // Update rate limit tracking
  recentRequests.push(now)
  rateLimitStore.set(key_record.id, recentRequests)

  // Update last used
  await db
    .update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, key_record.id))

  return {
    valid: true,
    tenantId: key_record.tenantId,
    scopes: key_record.scopes.split(','),
  }
}
