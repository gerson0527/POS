import type { AssistantRuntimeConfig } from './config'

export interface SpeechToText {
  transcribe(input: {
    buffer: Buffer
    mimeType?: string
    filename?: string
  }): Promise<{ text: string; provider: string }>
}

class UnsupportedStt implements SpeechToText {
  async transcribe(): Promise<{ text: string; provider: string }> {
    throw new Error(
      'STT no configurado. Defina ASSISTANT_STT_PROVIDER=groq|openai y ASSISTANT_STT_API_KEY.'
    )
  }
}

/** Cliente Whisper OpenAI-compatible (Groq, OpenAI, etc.). */
class OpenAiCompatibleStt implements SpeechToText {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl: string,
    private readonly provider: string
  ) {}

  async transcribe(input: {
    buffer: Buffer
    mimeType?: string
    filename?: string
  }): Promise<{ text: string; provider: string }> {
    const form = new FormData()
    const blob = new Blob([new Uint8Array(input.buffer)], {
      type: input.mimeType || 'audio/ogg',
    })
    form.append('file', blob, input.filename || 'voice.ogg')
    form.append('model', this.model)
    form.append('language', 'es')
    form.append('response_format', 'json')

    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`STT HTTP ${res.status}: ${body.slice(0, 200)}`)
    }
    const json = (await res.json()) as { text?: string }
    const text = (json.text || '').trim()
    if (!text) throw new Error('La transcripción quedó vacía.')
    return { text, provider: this.provider }
  }
}

export function createSpeechToText(config: AssistantRuntimeConfig): SpeechToText {
  const { stt } = config
  if (stt.provider === 'none' || !stt.apiKey) return new UnsupportedStt()

  if (stt.provider === 'groq') {
    return new OpenAiCompatibleStt(
      stt.apiKey,
      stt.model,
      stt.baseUrl || 'https://api.groq.com/openai/v1',
      'groq'
    )
  }
  if (stt.provider === 'openai') {
    return new OpenAiCompatibleStt(
      stt.apiKey,
      stt.model || 'whisper-1',
      stt.baseUrl || 'https://api.openai.com/v1',
      'openai'
    )
  }
  return new UnsupportedStt()
}
