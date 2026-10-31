import type { AssistantLlmConfig } from './config'
import {
  ASSISTANT_INTENT_SYSTEM_PROMPT,
  assistantIntentSchema,
  type AssistantIntent,
} from './intents'
import {
  freeModelCandidates,
  isAutoRotateModel,
  resolveFreeChatModels,
} from './llm-models'

function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1].trim() : trimmed
}

function parseIntentJson(raw: string): AssistantIntent {
  const text = stripCodeFences(raw)
  const parsed = JSON.parse(text) as unknown
  return assistantIntentSchema.parse(parsed)
}

async function callChatCompletions(
  llm: AssistantLlmConfig,
  model: string,
  userText: string
): Promise<AssistantIntent> {
  const res = await fetch(`${llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${llm.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'pos-dian-assistant',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: ASSISTANT_INTENT_SYSTEM_PROMPT },
        { role: 'user', content: userText },
      ],
    }),
    signal: AbortSignal.timeout(llm.timeoutMs),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`LLM HTTP ${res.status} (${model}): ${body.slice(0, 200)}`)
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error(`El LLM (${model}) no devolvió contenido.`)
  return parseIntentJson(content)
}

/**
 * Cliente OpenAI-compatible (OpenCode Zen, OpenRouter, OpenAI, etc.).
 * Si model está vacío / auto / free / rotate → rota entre modelos gratis de Zen
 * y hace failover al siguiente si uno falla.
 */
export async function extractIntent(
  llm: AssistantLlmConfig,
  userText: string
): Promise<AssistantIntent> {
  const models = isAutoRotateModel(llm.model)
    ? freeModelCandidates(await resolveFreeChatModels(llm.baseUrl), 4)
    : [llm.model]

  let lastError: unknown
  for (const model of models) {
    try {
      return await callChatCompletions(llm, model, userText)
    } catch (err) {
      lastError = err
      console.warn('[assistant/llm] fallo modelo', model, err instanceof Error ? err.message : err)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
