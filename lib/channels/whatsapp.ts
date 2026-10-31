import type { ChannelAdapter, IncomingMessage, OutgoingMessage } from './types'

export interface WhatsAppConfig {
  accessToken: string
  phoneNumberId: string
  verifyToken: string
  appSecret?: string
}

type WaMessage = {
  from: string
  id: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  audio?: { id?: string }
  voice?: { id?: string }
  button?: { payload?: string; text?: string }
  interactive?: {
    type?: string
    button_reply?: { id?: string; title?: string }
    list_reply?: { id?: string; title?: string }
  }
}

type WaChange = {
  value?: {
    messages?: WaMessage[]
    metadata?: { phone_number_id?: string }
  }
}

/**
 * Adaptador WhatsApp Cloud API (Meta).
 * El núcleo del asistente solo ve IncomingMessage / OutgoingMessage.
 */
export function createWhatsAppAdapter(config: WhatsAppConfig): ChannelAdapter {
  const api = `https://graph.facebook.com/v21.0/${config.phoneNumberId}`

  async function wa(path: string, body: Record<string, unknown>) {
    const res = await fetch(`${api}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`WhatsApp ${path} ${res.status}: ${text.slice(0, 200)}`)
    }
    return res.json()
  }

  return {
    parseIncoming(raw: unknown): IncomingMessage | null {
      const payload = raw as { entry?: Array<{ changes?: WaChange[] }> }
      const change = payload?.entry?.[0]?.changes?.[0]
      const message = change?.value?.messages?.[0]
      if (!message?.from || !message.id) return null

      const interactiveId =
        message.interactive?.button_reply?.id ||
        message.interactive?.list_reply?.id ||
        message.button?.payload

      if (interactiveId) {
        return {
          channel: 'whatsapp',
          externalUpdateId: message.id,
          externalUserId: message.from,
          chatId: message.from,
          type: 'callback',
          callbackData: interactiveId,
        }
      }

      const audioId = message.audio?.id || message.voice?.id || null
      const text = (message.text?.body || '').trim()
      const isCommand = text.startsWith('/')
      return {
        channel: 'whatsapp',
        externalUpdateId: message.id,
        externalUserId: message.from,
        chatId: message.from,
        type: audioId ? 'voice' : isCommand ? 'command' : 'text',
        text: text || null,
        mediaFileId: audioId,
      }
    },

    async sendText(message: OutgoingMessage): Promise<void> {
      // WhatsApp no usa Markdown de Telegram; enviamos texto plano.
      const text = message.text.replace(/\*/g, '').replace(/_/g, '')

      if (message.options?.length) {
        await wa('/messages', {
          messaging_product: 'whatsapp',
          to: message.chatId,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: text.slice(0, 1024) },
            action: {
              buttons: message.options.slice(0, 3).map((opt) => ({
                type: 'reply',
                reply: {
                  id: opt.data.slice(0, 256),
                  title: opt.label.slice(0, 20),
                },
              })),
            },
          },
        })
        return
      }

      await wa('/messages', {
        messaging_product: 'whatsapp',
        to: message.chatId,
        type: 'text',
        text: { body: text.slice(0, 4096) },
      })
    },

    async downloadMedia(fileId: string) {
      const metaRes = await fetch(`https://graph.facebook.com/v21.0/${fileId}`, {
        headers: { Authorization: `Bearer ${config.accessToken}` },
        signal: AbortSignal.timeout(20_000),
      })
      if (!metaRes.ok) throw new Error(`WhatsApp media meta ${metaRes.status}`)
      const meta = (await metaRes.json()) as { url?: string; mime_type?: string }
      if (!meta.url) throw new Error('WhatsApp no devolvió URL de media.')
      const fileRes = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${config.accessToken}` },
        signal: AbortSignal.timeout(60_000),
      })
      if (!fileRes.ok) throw new Error(`WhatsApp media download ${fileRes.status}`)
      return {
        buffer: Buffer.from(await fileRes.arrayBuffer()),
        mimeType: meta.mime_type,
      }
    },
  }
}

export function getWhatsAppConfigFromEnv(): WhatsAppConfig | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim()
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim()
  if (!accessToken || !phoneNumberId || !verifyToken) return null
  return {
    accessToken,
    phoneNumberId,
    verifyToken,
    appSecret: process.env.WHATSAPP_APP_SECRET?.trim() || undefined,
  }
}
