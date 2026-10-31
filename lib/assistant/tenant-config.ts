/**
 * Credenciales del asistente POR TENANT (mismo patrón que Factus).
 * El .env solo guarda ENCRYPTION_KEY; cada cliente configura las suyas en el panel.
 */
import { and, eq, isNotNull, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { decryptSecret, decryptSecretSafe, encryptSecret } from '@/lib/security/encrypt'
import type { AssistantRuntimeConfig } from './config'

export interface TenantAssistantPublicStatus {
  enabled: boolean
  hasTelegram: boolean
  botUsername: string | null
  hasLlm: boolean
  llmModel: string | null
  llmBaseUrl: string | null
  sttProvider: string
  hasStt: boolean
  draftTtlMinutes: number
  hasWebhookSecret: boolean
}

export interface TenantAssistantFormConfig {
  enabled: boolean
  telegramBotToken: string
  telegramBotUsername: string
  telegramWebhookSecret: string
  llmBaseUrl: string
  llmApiKey: string
  llmModel: string
  sttProvider: 'none' | 'groq' | 'openai'
  sttApiKey: string
  sttModel: string
  sttBaseUrl: string
  draftTtlMinutes: number
  hasTelegramBotToken: boolean
  hasLlmApiKey: boolean
  hasSttApiKey: boolean
  hasWebhookSecret: boolean
}

export interface TenantAssistantInput {
  enabled?: boolean
  telegramBotToken?: string
  telegramBotUsername?: string
  telegramWebhookSecret?: string
  llmBaseUrl?: string
  llmApiKey?: string
  llmModel?: string
  sttProvider?: 'none' | 'groq' | 'openai'
  sttApiKey?: string
  sttModel?: string
  sttBaseUrl?: string
  draftTtlMinutes?: number
}

function asRuntime(row: typeof schema.tenant.$inferSelect): AssistantRuntimeConfig {
  const token = decryptSecretSafe(row.assistantTelegramBotToken) || ''
  const llmKey = decryptSecretSafe(row.assistantLlmApiKey) || ''
  // Vacío / auto / free / rotate → rotación de modelos gratis (ver llm-models.ts).
  const llmModel = (row.assistantLlmModel || '').trim() || 'auto'
  const sttKey = decryptSecretSafe(row.assistantSttApiKey)
  const sttProvider = (row.assistantSttProvider || 'none') as 'none' | 'groq' | 'openai'
  const ttl = Number(row.assistantDraftTtlMinutes ?? 10)

  return {
    enabled: row.assistantEnabled === 'SI',
    draftTtlMinutes: Number.isFinite(ttl) && ttl > 0 ? ttl : 10,
    llm: llmKey
      ? {
          baseUrl: (row.assistantLlmBaseUrl || 'https://opencode.ai/zen/v1').replace(/\/$/, ''),
          apiKey: llmKey,
          model: llmModel,
          timeoutMs: 30_000,
        }
      : null,
    telegram: token
      ? {
          botToken: token,
          webhookSecret: decryptSecretSafe(row.assistantTelegramWebhookSecret) || '',
          webhookUrl: null,
          botUsername: row.assistantTelegramBotUsername?.replace(/^@/, '') || null,
        }
      : null,
    stt: {
      provider: sttProvider,
      apiKey: sttKey,
      model: row.assistantSttModel || 'whisper-large-v3',
      baseUrl: row.assistantSttBaseUrl || null,
    },
  }
}

export async function getTenantAssistantRuntime(
  tenantId: string
): Promise<AssistantRuntimeConfig | null> {
  const rows = await db
    .select()
    .from(schema.tenant)
    .where(eq(schema.tenant.id, tenantId))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return asRuntime(row)
}

export async function getTenantAssistantForm(tenantId: string): Promise<TenantAssistantFormConfig> {
  const rows = await db
    .select()
    .from(schema.tenant)
    .where(eq(schema.tenant.id, tenantId))
    .limit(1)
  const row = rows[0]
  if (!row) {
    return {
      enabled: false,
      telegramBotToken: '',
      telegramBotUsername: '',
      telegramWebhookSecret: '',
      llmBaseUrl: 'https://opencode.ai/zen/v1',
      llmApiKey: '',
      llmModel: '',
      sttProvider: 'none',
      sttApiKey: '',
      sttModel: 'whisper-large-v3',
      sttBaseUrl: '',
      draftTtlMinutes: 10,
      hasTelegramBotToken: false,
      hasLlmApiKey: false,
      hasSttApiKey: false,
      hasWebhookSecret: false,
    }
  }

  return {
    enabled: row.assistantEnabled === 'SI',
    telegramBotToken: '',
    telegramBotUsername: row.assistantTelegramBotUsername || '',
    telegramWebhookSecret: '',
    llmBaseUrl: row.assistantLlmBaseUrl || 'https://opencode.ai/zen/v1',
    llmApiKey: '',
    llmModel: row.assistantLlmModel || '',
    sttProvider: (row.assistantSttProvider as 'none' | 'groq' | 'openai') || 'none',
    sttApiKey: '',
    sttModel: row.assistantSttModel || 'whisper-large-v3',
    sttBaseUrl: row.assistantSttBaseUrl || '',
    draftTtlMinutes: Number(row.assistantDraftTtlMinutes ?? 10) || 10,
    hasTelegramBotToken: Boolean(row.assistantTelegramBotToken),
    hasLlmApiKey: Boolean(row.assistantLlmApiKey),
    hasSttApiKey: Boolean(row.assistantSttApiKey),
    hasWebhookSecret: Boolean(row.assistantTelegramWebhookSecret),
  }
}

export function buildAssistantConfigUpdate(input: TenantAssistantInput): Record<string, unknown> {
  const update: Record<string, unknown> = {}
  if (input.enabled !== undefined) update.assistantEnabled = input.enabled ? 'SI' : 'NO'
  if (input.telegramBotToken) {
    update.assistantTelegramBotToken = encryptSecret(input.telegramBotToken)
  }
  if (input.telegramBotUsername !== undefined) {
    update.assistantTelegramBotUsername =
      input.telegramBotUsername.trim().replace(/^@/, '') || null
  }
  if (input.telegramWebhookSecret) {
    update.assistantTelegramWebhookSecret = encryptSecret(input.telegramWebhookSecret)
  }
  if (input.llmBaseUrl !== undefined) {
    update.assistantLlmBaseUrl = input.llmBaseUrl.trim() || null
  }
  if (input.llmApiKey) update.assistantLlmApiKey = encryptSecret(input.llmApiKey)
  if (input.llmModel !== undefined) {
    const m = input.llmModel.trim()
    // Vacío / auto / free / rotate se guardan como null → runtime usa "auto".
    update.assistantLlmModel =
      !m || /^(auto|free|rotate|auto-free)$/i.test(m) ? null : m
  }
  if (input.sttProvider !== undefined) update.assistantSttProvider = input.sttProvider
  if (input.sttApiKey) update.assistantSttApiKey = encryptSecret(input.sttApiKey)
  if (input.sttModel !== undefined) update.assistantSttModel = input.sttModel.trim() || null
  if (input.sttBaseUrl !== undefined) update.assistantSttBaseUrl = input.sttBaseUrl.trim() || null
  if (input.draftTtlMinutes !== undefined) {
    const n = Number(input.draftTtlMinutes)
    update.assistantDraftTtlMinutes = Number.isFinite(n) && n > 0 ? Math.floor(n) : 10
  }
  return update
}

export function publicStatusFromRuntime(
  runtime: AssistantRuntimeConfig | null,
  botUsername?: string | null
): TenantAssistantPublicStatus {
  return {
    enabled: Boolean(runtime?.enabled),
    hasTelegram: Boolean(runtime?.telegram),
    botUsername: botUsername ?? runtime?.telegram?.botUsername ?? null,
    hasLlm: Boolean(runtime?.llm),
    llmModel: runtime?.llm
      ? !runtime.llm.model ||
        /^(auto|free|rotate|auto-free)$/i.test(runtime.llm.model)
        ? 'auto (rota free)'
        : runtime.llm.model
      : null,
    llmBaseUrl: runtime?.llm?.baseUrl ?? null,
    sttProvider: runtime?.stt.provider ?? 'none',
    hasStt: runtime?.stt.provider !== 'none' && Boolean(runtime?.stt.apiKey),
    draftTtlMinutes: runtime?.draftTtlMinutes ?? 10,
    hasWebhookSecret: Boolean(runtime?.telegram?.webhookSecret),
  }
}

/** Tenants con bot de Telegram activo (para polling multi-empresa). */
export async function listTenantsWithTelegramBot(): Promise<
  Array<{ tenantId: string; runtime: AssistantRuntimeConfig }>
> {
  const rows = await db
    .select()
    .from(schema.tenant)
    .where(
      and(
        eq(schema.tenant.assistantEnabled, 'SI'),
        eq(schema.tenant.status, 'ACTIVE'),
        isNotNull(schema.tenant.assistantTelegramBotToken),
        ne(schema.tenant.assistantTelegramBotToken, '')
      )
    )

  return rows
    .map((row) => ({ tenantId: row.id, runtime: asRuntime(row) }))
    .filter((t) => Boolean(t.runtime.telegram?.botToken))
}

/** Resuelve tenant por secreto de webhook de Telegram. */
export async function findTenantByTelegramWebhookSecret(
  secret: string
): Promise<{ tenantId: string; runtime: AssistantRuntimeConfig } | null> {
  if (!secret) return null
  const rows = await db
    .select()
    .from(schema.tenant)
    .where(
      and(
        eq(schema.tenant.assistantEnabled, 'SI'),
        isNotNull(schema.tenant.assistantTelegramWebhookSecret)
      )
    )
  for (const row of rows) {
    const stored = decryptSecretSafe(row.assistantTelegramWebhookSecret)
    if (stored && stored === secret) {
      return { tenantId: row.id, runtime: asRuntime(row) }
    }
  }
  return null
}

export async function getTenantById(tenantId: string) {
  const rows = await db.select().from(schema.tenant).where(eq(schema.tenant.id, tenantId)).limit(1)
  return rows[0] ?? null
}

/** Evita warning unused decryptSecret if only Safe used in some paths. */
export function _assertDecryptAvailable() {
  return typeof decryptSecret === 'function'
}
