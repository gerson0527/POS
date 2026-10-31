/**
 * Deep links Telegram: https://t.me/Bot?start=CODIGO
 * El username puede venir del tenant o resolverse con getMe(token).
 */

let cachedByToken = new Map<string, string | null>()

export async function resolveTelegramBotUsername(
  botToken?: string | null
): Promise<string | null> {
  const fromEnv = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '')
  if (!botToken && fromEnv) return fromEnv
  if (!botToken) return null

  if (cachedByToken.has(botToken)) return cachedByToken.get(botToken) ?? null

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      cachedByToken.set(botToken, null)
      return null
    }
    const json = (await res.json()) as { ok?: boolean; result?: { username?: string } }
    const username = json.result?.username?.trim() || null
    cachedByToken.set(botToken, username)
    return username
  } catch {
    cachedByToken.set(botToken, null)
    return null
  }
}

export function buildTelegramStartLink(botUsername: string, code: string): string {
  const user = botUsername.replace(/^@/, '')
  const payload = code.trim().toUpperCase()
  return `https://t.me/${user}?start=${encodeURIComponent(payload)}`
}
