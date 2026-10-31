export type ChannelName = 'telegram' | 'whatsapp'

export interface IncomingMessage {
  channel: ChannelName
  externalUpdateId: string
  externalUserId: string
  chatId: string
  type: 'text' | 'voice' | 'callback' | 'command'
  text?: string | null
  mediaFileId?: string | null
  callbackData?: string | null
  callbackQueryId?: string | null
}

export interface ConfirmationOption {
  label: string
  data: string
}

export interface OutgoingMessage {
  chatId: string
  text: string
  parseMode?: 'Markdown' | 'HTML'
  options?: ConfirmationOption[]
}

export interface ChannelAdapter {
  parseIncoming(raw: unknown): IncomingMessage | null
  sendText(message: OutgoingMessage): Promise<void>
  answerCallback?(callbackQueryId: string, text?: string): Promise<void>
  downloadMedia?(fileId: string): Promise<{ buffer: Buffer; mimeType?: string }>
}
