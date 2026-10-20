// lib/security/rate-limit.ts
//
// Rate limiting con contador persistente en Postgres (seguridad H-4).
// A diferencia de un Map en memoria, sobrevive a reinicios/escala de instancias
// serverless (Vercel) porque el estado vive en la base de datos.
//
// Estrategia: ventana fija. La clave agrupa (p. ej. `apikey:<id>`); al cambiar de
// ventana el contador se reinicia mediante un UPSERT atómico.

import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

export interface RateLimitResult {
  allowed: boolean
  count: number
  limit: number
  retryAfterSeconds: number
}

/**
 * Incrementa el contador de `key` y evalúa si la petición está permitida.
 * Si la consulta falla, se DENIEGA (fail-closed): un fallo de BD no debe
 * desactivar el límite de peticiones de una API key.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now()
  const windowStartMs = Math.floor(now / windowMs) * windowMs
  const windowStart = new Date(windowStartMs)
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStartMs + windowMs - now) / 1000))

  try {
    const result = await db.execute(sql`
      INSERT INTO rate_limit_bucket (id, window_start, count)
      VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT (id) DO UPDATE SET
        count = CASE
          WHEN rate_limit_bucket.window_start < ${windowStart} THEN 1
          ELSE rate_limit_bucket.count + 1
        END,
        window_start = CASE
          WHEN rate_limit_bucket.window_start < ${windowStart} THEN ${windowStart}
          ELSE rate_limit_bucket.window_start
        END
      RETURNING count
    `)
    const first = (result as unknown as { rows?: Array<{ count?: number | string }> }).rows?.[0]
    const count = Number(first?.count ?? 1)
    return { allowed: count <= limit, count, limit, retryAfterSeconds }
  } catch (err) {
    console.error('[rate-limit] error consultando el contador; se deniega la petición:', err)
    return { allowed: false, count: limit, limit, retryAfterSeconds: 60 }
  }
}
