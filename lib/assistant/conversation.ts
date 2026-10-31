import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import type { TenantRole } from '@/lib/auth/session-context'
import { getBogotaBusinessDate } from '@/lib/utils/business-date'
import type { AssistantRuntimeConfig } from './config'
import { getTenantAssistantRuntime } from './tenant-config'
import { extractIntent } from './extract'
import { tryParseIntentFallback } from './fallback-parse'
import {
  applyCustomerChoice,
  applyFinalConsumer,
  applyProductChoice,
  resolveIntent,
  type ResolvedIntent,
} from './resolve'
import { buildDraftOptions, buildSummary } from './summary'
import {
  cancelDraft,
  createDraft,
  getDraft,
  updateDraftResolved,
} from './drafts'
import {
  findActiveLinkByExternal,
  getMembershipRole,
  redeemLinkCode,
} from './links'
import { canHandleIntent, permissionDeniedMessage } from './permissions'
import { createSpeechToText } from './stt'
import { actorFromLink, executeConfirmedDraft } from './execute'
import type { ChannelAdapter, IncomingMessage } from '@/lib/channels/types'

async function persistIncoming(
  msg: IncomingMessage,
  link: { tenantId: string; userId: string } | null,
  extras?: { transcript?: string | null; rawText?: string | null }
): Promise<{ id: string; duplicated: boolean }> {
  const id = `cmsg_${randomUUID()}`
  try {
    await db.insert(schema.channelMessage).values({
      id,
      channel: msg.channel,
      externalUpdateId: msg.externalUpdateId,
      externalUserId: msg.externalUserId,
      tenantId: link?.tenantId ?? null,
      userId: link?.userId ?? null,
      type: msg.type,
      rawText: extras?.rawText ?? msg.text ?? null,
      transcript: extras?.transcript ?? null,
      mediaRef: msg.mediaFileId ?? null,
      callbackData: msg.callbackData ?? null,
    })
    return { id, duplicated: false }
  } catch {
    return { id, duplicated: true }
  }
}

function parseVincular(text: string): string | null {
  const trimmed = text.trim()
  // Deep link: /start CODIGO  o  /start@Bot CODIGO
  const start = trimmed.match(/^\/start(?:@\w+)?(?:\s+|_)([A-Za-z0-9]{4,64})\s*$/i)
  if (start?.[1] && !/^(ayuda|help)$/i.test(start[1])) return start[1]
  const vincular = trimmed.match(/^\/vincular(?:@\w+)?\s+([A-Za-z0-9]+)\s*$/i)
  return vincular?.[1] ?? null
}

async function handleCallback(params: {
  adapter: ChannelAdapter
  msg: IncomingMessage
  link: { id: string; tenantId: string; userId: string }
  role: TenantRole
  inboxId: string
}) {
  const { adapter, msg, link, role, inboxId } = params
  const data = (msg.callbackData || '').trim()

  if (msg.callbackQueryId && adapter.answerCallback) {
    await adapter.answerCallback(msg.callbackQueryId)
  }

  if (data.startsWith('cancel:')) {
    const draftId = data.slice('cancel:'.length)
    const ok = await cancelDraft({
      tenantId: link.tenantId,
      userId: link.userId,
      draftId,
    })
    await adapter.sendText({
      chatId: msg.chatId,
      text: ok ? 'Borrador cancelado.' : 'No se pudo cancelar (ya no estaba pendiente).',
    })
    return
  }

  if (data.startsWith('confirm:')) {
    const draftId = data.slice('confirm:'.length)
    const result = await executeConfirmedDraft({
      actor: actorFromLink({ ...link, role }),
      draftId,
      channelMessageId: inboxId,
    })
    await adapter.sendText({
      chatId: msg.chatId,
      text: result.message,
      parseMode: 'Markdown',
    })
    return
  }

  if (data.startsWith('pp:')) {
    const parts = data.split(':')
    const draftId = parts[1]
    const lineIndex = Number(parts[2])
    const candIndex = Number(parts[3])
    const draft = await getDraft(link.tenantId, draftId)
    if (!draft || draft.userId !== link.userId) {
      await adapter.sendText({ chatId: msg.chatId, text: 'Borrador no encontrado.' })
      return
    }
    const resolved = draft.resolvedJson as ResolvedIntent
    const productId = resolved.products[lineIndex]?.candidates?.[candIndex]?.id
    if (!productId) {
      await adapter.sendText({ chatId: msg.chatId, text: 'Opción inválida.' })
      return
    }
    let next = await applyProductChoice(link.tenantId, resolved, lineIndex, productId)
    if (next.intent.type === 'STOCK_QUERY' && next.products[0]?.product) {
      const { getProductStock } = await import('./stock')
      next = {
        ...next,
        stockLevels: await getProductStock(link.tenantId, next.products[0].product.id),
        blockers: next.blockers,
      }
      next = { ...next, blockers: next.products.some((p) => p.status !== 'matched') ? next.blockers : [] }
    }
    const summary = buildSummary(next)
    const status =
      next.blockers.length || next.products.some((p) => p.status === 'ambiguous')
        ? 'AWAITING_CLARIFICATION'
        : next.intent.type === 'STOCK_QUERY'
          ? 'PENDING'
          : 'PENDING'
    await updateDraftResolved({
      tenantId: link.tenantId,
      userId: link.userId,
      draftId,
      resolved: next,
      summary,
      status: status === 'AWAITING_CLARIFICATION' ? 'AWAITING_CLARIFICATION' : 'PENDING',
    })
    if (next.intent.type === 'STOCK_QUERY' && !next.blockers.length) {
      await adapter.sendText({ chatId: msg.chatId, text: summary, parseMode: 'Markdown' })
      return
    }
    await adapter.sendText({
      chatId: msg.chatId,
      text: summary,
      parseMode: 'Markdown',
      options: buildDraftOptions(draftId, next),
    })
    return
  }

  if (data.startsWith('pc:')) {
    const parts = data.split(':')
    const draftId = parts[1]
    const candIndex = Number(parts[2])
    const draft = await getDraft(link.tenantId, draftId)
    if (!draft || draft.userId !== link.userId) {
      await adapter.sendText({ chatId: msg.chatId, text: 'Borrador no encontrado.' })
      return
    }
    const resolved = draft.resolvedJson as ResolvedIntent
    const customerId = resolved.customer.candidates?.[candIndex]?.id
    if (!customerId) {
      await adapter.sendText({ chatId: msg.chatId, text: 'Opción inválida.' })
      return
    }
    const next = await applyCustomerChoice(link.tenantId, resolved, customerId)
    const summary = buildSummary(next)
    await updateDraftResolved({
      tenantId: link.tenantId,
      userId: link.userId,
      draftId,
      resolved: next,
      summary,
      status: next.blockers.length ? 'AWAITING_CLARIFICATION' : 'PENDING',
    })
    await adapter.sendText({
      chatId: msg.chatId,
      text: summary,
      parseMode: 'Markdown',
      options: buildDraftOptions(draftId, next),
    })
    return
  }

  if (data.startsWith('cf:')) {
    const draftId = data.slice('cf:'.length)
    const draft = await getDraft(link.tenantId, draftId)
    if (!draft || draft.userId !== link.userId) {
      await adapter.sendText({ chatId: msg.chatId, text: 'Borrador no encontrado.' })
      return
    }
    const resolved = draft.resolvedJson as ResolvedIntent
    const next = applyFinalConsumer(resolved)
    const summary = buildSummary(next)
    await updateDraftResolved({
      tenantId: link.tenantId,
      userId: link.userId,
      draftId,
      resolved: next,
      summary,
      status: next.blockers.length ? 'AWAITING_CLARIFICATION' : 'PENDING',
    })
    await adapter.sendText({
      chatId: msg.chatId,
      text: summary,
      parseMode: 'Markdown',
      options: buildDraftOptions(draftId, next),
    })
    return
  }

  await adapter.sendText({ chatId: msg.chatId, text: 'Acción no reconocida.' })
}

/**
 * Orquestador del asistente: texto/voz → intención → resolución → resumen
 * → confirmación → ejecución vía servicios de dominio (el LLM nunca escribe en BD).
 *
 * `botTenantId`: empresa dueña del bot que recibió el mensaje (credenciales en BD).
 */
export async function handleIncomingMessage(
  adapter: ChannelAdapter,
  msg: IncomingMessage,
  opts: { botTenantId: string; runtime?: AssistantRuntimeConfig }
): Promise<void> {
  let config =
    opts.runtime ?? (await getTenantAssistantRuntime(opts.botTenantId))
  if (!config?.enabled) {
    await adapter.sendText({
      chatId: msg.chatId,
      text:
        'El asistente de esta empresa está desactivado. Actívelo en Configuración → Asistente Telegram.',
    })
    return
  }

  if (msg.type === 'command' || msg.type === 'text') {
    const text = (msg.text || '').trim()
    const code = parseVincular(text)
    if (code || /^\/vincular/i.test(text)) {
      if (!code) {
        await adapter.sendText({
          chatId: msg.chatId,
          text: 'Uso: abra el enlace del panel o envíe /vincular CODIGO',
        })
        return
      }
      const result = await redeemLinkCode({
        channel: msg.channel,
        externalUserId: msg.externalUserId,
        code,
        expectedTenantId: opts.botTenantId,
      })
      await adapter.sendText({
        chatId: msg.chatId,
        text: result.ok
          ? '✅ Chat vinculado. Ya puede facturar (con caja abierta) o mover inventario.'
          : `❌ ${result.message}`,
      })
      return
    }
    if (/^\/start/i.test(text)) {
      await adapter.sendText({
        chatId: msg.chatId,
        text:
          'Hola. Soy el asistente del POS.\n\n' +
          'Vincúlese desde el panel (Configuración → Asistente → Abrir Telegram), ' +
          'o envíe `/vincular CODIGO`.\n\n' +
          'Para *facturar* necesita un turno de caja abierto en el POS.\n' +
          'Puede enviar texto o nota de voz.',
        parseMode: 'Markdown',
      })
      return
    }
    if (/^\/ayuda/i.test(text) || /^\/help/i.test(text)) {
      await adapter.sendText({
        chatId: msg.chatId,
        text:
          '*Qué puedo hacer*\n' +
          '• Facturar (caja abierta)\n' +
          '• Entrada / salida de inventario\n' +
          '• Consultar stock\n\n' +
          '*Factura — un producto*\n' +
          '`Facturar Agua Mineral Sin Gas 600ml`\n' +
          '→ pediré el cliente o Consumidor final\n\n' +
          '*Varios productos*\n' +
          '`Factura 2 pan, 1 leche cliente 1234567890`\n\n' +
          '*Varios pagos*\n' +
          '`Factura 1 pan nequi 20000 efectivo resto`\n\n' +
          '*Inventario / stock*\n' +
          '`Entrada 10 arroz` · `Sale 3 leche` · `Cuánto hay de azúcar`\n\n' +
          'Si la cédula no existe → aviso y CONSUMIDOR FINAL.\n' +
          'Tras el resumen, pulse Confirmar.',
        parseMode: 'Markdown',
      })
      return
    }
  }

  const link = await findActiveLinkByExternal(msg.channel, msg.externalUserId)
  if (link && link.tenantId !== opts.botTenantId) {
    await adapter.sendText({
      chatId: msg.chatId,
      text: 'Este chat está vinculado a otra empresa. Revóquelo allí antes de vincularlo aquí.',
    })
    return
  }

  // Tras vincular, recargar config del tenant (por si cambiaron el LLM).
  if (link) {
    const fresh = await getTenantAssistantRuntime(link.tenantId)
    if (fresh) config = fresh
  }

  let workingText = (msg.text || '').trim()
  let transcript: string | null = null

  if (msg.type === 'voice') {
    if (!msg.mediaFileId || !adapter.downloadMedia) {
      await adapter.sendText({ chatId: msg.chatId, text: 'No pude descargar la nota de voz.' })
      return
    }
    try {
      const stt = createSpeechToText(config)
      const media = await adapter.downloadMedia(msg.mediaFileId)
      const result = await stt.transcribe({
        buffer: media.buffer,
        mimeType: media.mimeType,
      })
      transcript = result.text
      workingText = result.text
      await adapter.sendText({
        chatId: msg.chatId,
        text: `🎙️ Escuché: _${transcript}_`,
        parseMode: 'Markdown',
      })
    } catch (err: any) {
      await adapter.sendText({
        chatId: msg.chatId,
        text: `No pude transcribir el audio: ${err?.message || 'error'}`,
      })
      return
    }
  }

  const inbox = await persistIncoming(msg, link, {
    transcript,
    rawText: workingText || msg.text,
  })
  if (inbox.duplicated) return

  if (!link) {
    await adapter.sendText({
      chatId: msg.chatId,
      text:
        'Este chat no está vinculado.\n' +
        'En el panel: Configuración → Asistente → *Vincular con Telegram*.',
      parseMode: 'Markdown',
    })
    return
  }

  const role = (await getMembershipRole(link.tenantId, link.userId)) as TenantRole | null
  if (!role) {
    await adapter.sendText({
      chatId: msg.chatId,
      text: 'Su usuario ya no tiene membresía activa en la empresa.',
    })
    return
  }

  if (msg.type === 'callback') {
    await handleCallback({
      adapter,
      msg,
      link: { id: link.id, tenantId: link.tenantId, userId: link.userId },
      role,
      inboxId: inbox.id,
    })
    return
  }

  if (!workingText) {
    await adapter.sendText({ chatId: msg.chatId, text: 'Envíe un mensaje de texto o una nota de voz.' })
    return
  }

  if (!config.llm) {
    await adapter.sendText({
      chatId: msg.chatId,
      text:
        'Falta configurar el modelo de IA de esta empresa.\n' +
        'Un administrador debe guardarlo en Configuración → Asistente Telegram.',
    })
    return
  }

  try {
    let intent
    let usedFallback = false
    try {
      intent = await extractIntent(config.llm, workingText)
    } catch (llmErr: any) {
      const fallback = tryParseIntentFallback(workingText)
      if (!fallback) throw llmErr
      intent = fallback
      usedFallback = true
      console.warn(
        '[assistant] LLM falló; usando parser local:',
        llmErr?.message ?? llmErr
      )
    }

    if (!canHandleIntent(role, intent)) {
      await adapter.sendText({
        chatId: msg.chatId,
        text: permissionDeniedMessage(intent.type, role),
      })
      return
    }

    const resolved = await resolveIntent(
      link.tenantId,
      link.userId,
      intent,
      getBogotaBusinessDate()
    )
    const summary =
      (usedFallback ? '_(Interpretado sin IA — formato directo)_\n\n' : '') +
      buildSummary(resolved)
    const draft = await createDraft({
      tenantId: link.tenantId,
      userId: link.userId,
      channelLinkId: link.id,
      channelMessageId: inbox.id,
      resolved,
      summary,
      ttlMinutes: config.draftTtlMinutes,
    })

    await adapter.sendText({
      chatId: msg.chatId,
      text: summary,
      parseMode: 'Markdown',
      options:
        draft.status === 'DONE'
          ? undefined
          : buildDraftOptions(draft.id, resolved),
    })
  } catch (err: any) {
    const raw = String(err?.message ?? err)
    console.error('[assistant] extract/resolve failed:', raw)
    let text =
      'No pude interpretar el mensaje. Envíe /ayuda o use:\n\n' +
      '• `Facturar Agua Mineral Sin Gas 600ml`\n' +
      '• `Factura 2 pan, 1 leche cliente 1234567890`\n' +
      '• `Factura 1 pan nequi 20000 efectivo resto`\n' +
      '• `Entrada 10 arroz` · `Cuánto hay de azúcar`'
    if (/FreeUsageLimitError|Free usage limit|429/i.test(raw)) {
      text =
        '⚠️ Se agotó la cuota free del LLM. Use el formato directo:\n\n' +
        '`Factura 2 pan, 1 leche cliente 1234567890`\n\n' +
        'O configure un modelo de pago en Configuración → Asistente.'
    } else if (/LLM HTTP 401|Unauthorized|invalid.?api.?key/i.test(raw)) {
      text =
        '⚠️ La API key del LLM fue rechazada. Revísela en Configuración → Asistente Telegram.'
    }
    await adapter.sendText({ chatId: msg.chatId, text, parseMode: 'Markdown' })
  }
}
