/**
 * Configuración del asistente por canal. Todo sale de variables de entorno:
 * no hay claves hardcodeadas. Si falta algo, el bot responde que no está
 * configurado en lugar de fallar con stack traces.
 */

export interface AssistantLlmConfig {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

export interface TelegramConfig {
  botToken: string
  webhookSecret: string
  /** URL pública del webhook (solo producción). Vacío = usar polling. */
  webhookUrl: string | null
  /** @usuario del bot sin @. Opcional: si falta se resuelve con getMe. */
  botUsername: string | null
}

export interface AssistantRuntimeConfig {
  enabled: boolean
  draftTtlMinutes: number
  llm: AssistantLlmConfig | null
  telegram: TelegramConfig | null
  stt: {
    provider: 'groq' | 'openai' | 'none'
    apiKey: string | null
    model: string
    baseUrl: string | null
  }
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function getAssistantConfig(): AssistantRuntimeConfig {
  const llmKey = process.env.ASSISTANT_LLM_API_KEY?.trim() || ''
  const llmBase =
    process.env.ASSISTANT_LLM_BASE_URL?.trim() || 'https://opencode.ai/zen/v1'
  const llmModel = process.env.ASSISTANT_LLM_MODEL?.trim() || ''

  const tgToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || ''
  const tgSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || ''

  const sttProvider = (process.env.ASSISTANT_STT_PROVIDER?.trim() || 'none') as
    | 'groq'
    | 'openai'
    | 'none'
  const sttKey = process.env.ASSISTANT_STT_API_KEY?.trim() || null

  return {
    enabled: process.env.ASSISTANT_ENABLED === '1' || process.env.ASSISTANT_ENABLED === 'true',
    draftTtlMinutes: readInt('ASSISTANT_DRAFT_TTL_MINUTES', 10),
    llm:
      llmKey && llmModel
        ? {
            baseUrl: llmBase.replace(/\/$/, ''),
            apiKey: llmKey,
            model: llmModel,
            timeoutMs: readInt('ASSISTANT_LLM_TIMEOUT_MS', 30_000),
          }
        : null,
    telegram: tgToken
      ? {
          botToken: tgToken,
          webhookSecret: tgSecret,
          webhookUrl: process.env.TELEGRAM_WEBHOOK_URL?.trim() || null,
          botUsername:
            process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '') || null,
        }
      : null,
    stt: {
      provider: sttProvider,
      apiKey: sttKey,
      model: process.env.ASSISTANT_STT_MODEL?.trim() || 'whisper-large-v3',
      baseUrl: process.env.ASSISTANT_STT_BASE_URL?.trim() || null,
    },
  }
}

export function assertAssistantReadyForTelegram(): {
  config: AssistantRuntimeConfig
  errors: string[]
} {
  const config = getAssistantConfig()
  const errors: string[] = []
  if (!config.enabled) errors.push('ASSISTANT_ENABLED no está activo (use 1 o true).')
  if (!config.telegram) errors.push('Falta TELEGRAM_BOT_TOKEN.')
  if (!config.llm) {
    errors.push('Faltan ASSISTANT_LLM_API_KEY y/o ASSISTANT_LLM_MODEL.')
  }
  return { config, errors }
}
