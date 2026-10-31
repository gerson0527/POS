import type { TelegramConfig } from '@/lib/assistant/config'
import type { ChannelAdapter, IncomingMessage, OutgoingMessage } from './types'

type TelegramUpdate = {
  update_id: number
  message?: {
    message_id: number
    text?: string
    caption?: string
    voice?: { file_id: string }
    audio?: { file_id: string }
    from?: { id: number; username?: string }
    chat: { id: number }
  }
  callback_query?: {
    id: string
    data?: string
    from: { id: number }
    message?: { chat: { id: number } }
  }
}

export function createTelegramAdapter(config: TelegramConfig): ChannelAdapter {
  const api = `https://api.telegram.org/bot${config.botToken}`

  async function tg(method: string, body: Record<string, unknown>) {
    const res = await fetch(`${api}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Telegram ${method} ${res.status}: ${text.slice(0, 200)}`)
    }
    return res.json()
  }

  return {
    parseIncoming(raw: unknown): IncomingMessage | null {
      const update = raw as TelegramUpdate
      if (!update || typeof update.update_id !== 'number') return null

      if (update.callback_query) {
        const cq = update.callback_query
        const chatId = cq.message?.chat.id
        if (!chatId) return null
        return {
          channel: 'telegram',
          externalUpdateId: `cb_${update.update_id}`,
          externalUserId: String(cq.from.id),
          chatId: String(chatId),
          type: 'callback',
          callbackData: cq.data ?? null,
          callbackQueryId: cq.id,
        }
      }

      const msg = update.message
      if (!msg?.from) return null
      const text = (msg.text || msg.caption || '').trim()
      const voiceId = msg.voice?.file_id || msg.audio?.file_id || null
      const isCommand = text.startsWith('/')
      return {
        channel: 'telegram',
        externalUpdateId: String(update.update_id),
        externalUserId: String(msg.from.id),
        chatId: String(msg.chat.id),
        type: voiceId ? 'voice' : isCommand ? 'command' : 'text',
        text: text || null,
        mediaFileId: voiceId,
      }
    },

    async sendText(message: OutgoingMessage): Promise<void> {
      const keyboard = message.options?.length
        ? {
            inline_keyboard: [
              message.options.map((opt) => ({
                text: opt.label,
                callback_data: opt.data.slice(0, 64),
              })),
            ],
          }
        : undefined

      await tg('sendMessage', {
        chat_id: message.chatId,
        text: message.text,
        parse_mode: message.parseMode ?? 'Markdown',
        reply_markup: keyboard,
      })
    },

    async answerCallback(callbackQueryId: string, text?: string): Promise<void> {
      await tg('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: text?.slice(0, 200),
      })
    },

    async downloadMedia(fileId: string) {
      const fileRes = (await tg('getFile', { file_id: fileId })) as {
        result?: { file_path?: string }
      }
      const path = fileRes.result?.file_path
      if (!path) throw new Error('Telegram no devolvió file_path.')
      const url = `https://api.telegram.org/file/bot${config.botToken}/${path}`
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok) throw new Error(`No se pudo descargar el audio (${res.status}).`)
      const buffer = Buffer.from(await res.arrayBuffer())
      return { buffer, mimeType: 'audio/ogg' }
    },
  }
}

export function verifyTelegramSecret(
  headerValue: string | null,
  expected: string
): boolean {
  if (!expected) return true // en polling local no hay secreto
  return Boolean(headerValue) && headerValue === expected
}
