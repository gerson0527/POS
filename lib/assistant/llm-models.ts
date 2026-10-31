/**
 * Rotación aleatoria de modelos gratis (OpenCode Zen / chat-completions).
 * Si el tenant deja MODEL vacío o pone auto|free|rotate, se elige al azar
 * de la lista en cada petición y se prueba otro si falla.
 */

/** Pool estático = modelos "Gratis" visibles en OpenCode Zen. */
export const FREE_CHAT_COMPLETION_MODELS = [
  'beam-free',
  'deepseek-v4.1-flash-free',
  'flint-40b-free',
  'glm-5.3-flash-free',
  'mimo-v2.6-flash-free',
  'nemotron-3.5-lightning-free',
  'nemotron-3.5-super-vl-free',
] as const

let cachedZenFree: string[] | null = null
let cachedZenAt = 0
const CACHE_MS = 30 * 60_000

export function isAutoRotateModel(model: string | null | undefined): boolean {
  const m = (model || '').trim().toLowerCase()
  return !m || m === 'auto' || m === 'free' || m === 'rotate' || m === 'auto-free'
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function nextFreeModel(pool: string[] = [...FREE_CHAT_COMPLETION_MODELS]): string {
  if (!pool.length) return FREE_CHAT_COMPLETION_MODELS[0]
  return pool[Math.floor(Math.random() * pool.length)]
}

/** Candidatos aleatorios para failover (primer intento + backups). */
export function freeModelCandidates(
  pool: string[] = [...FREE_CHAT_COMPLETION_MODELS],
  max = 4
): string[] {
  const source = pool.length ? pool : [...FREE_CHAT_COMPLETION_MODELS]
  return shuffle(source).slice(0, Math.min(max, source.length))
}

/**
 * Intenta refrescar la lista free desde Zen. Si falla, usa el pool estático.
 * Solo aplica a baseUrl de opencode.ai/zen.
 */
export async function resolveFreeChatModels(baseUrl: string): Promise<string[]> {
  const isZen = /opencode\.ai\/zen/i.test(baseUrl)
  if (!isZen) return [...FREE_CHAT_COMPLETION_MODELS]

  const now = Date.now()
  if (cachedZenFree && now - cachedZenAt < CACHE_MS) return cachedZenFree

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
      headers: { Accept: 'application/json', 'User-Agent': 'pos-dian-assistant' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) throw new Error(`models ${res.status}`)
    const json = (await res.json()) as { data?: Array<{ id?: string }> }
    const ids = (json.data || [])
      .map((m) => m.id || '')
      .filter((id) => id && /free$/i.test(id))
    // Preferir el pool conocido (chat/completions); extras free al final.
    const preferred: string[] = FREE_CHAT_COMPLETION_MODELS.filter((id) =>
      ids.includes(id)
    )
    const extras = ids.filter((id) => !preferred.includes(id))
    const pool: string[] = [...preferred, ...extras]
    cachedZenFree = pool.length ? pool : [...FREE_CHAT_COMPLETION_MODELS]
    cachedZenAt = now
    return cachedZenFree
  } catch {
    return [...FREE_CHAT_COMPLETION_MODELS]
  }
}
