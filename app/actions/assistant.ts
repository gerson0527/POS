'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { AuditAction } from '@/lib/types'
import { requireActor, logAudit } from './_shared'
import { safeAction } from './_result'
import {
  createChannelLinkCode,
  listChannelLinks,
  revokeChannelLink,
} from '@/lib/assistant/links'
import {
  buildTelegramStartLink,
  resolveTelegramBotUsername,
} from '@/lib/assistant/telegram-deep-link'
import {
  buildAssistantConfigUpdate,
  getTenantAssistantForm,
  getTenantAssistantRuntime,
  publicStatusFromRuntime,
  type TenantAssistantInput,
} from '@/lib/assistant/tenant-config'

export async function getAssistantStatus() {
  const actor = await requireActor(['ADMIN', 'MANAGER', 'CASHIER', 'VIEWER'])
  const runtime = await getTenantAssistantRuntime(actor.tenantId)
  const botUsername =
    runtime?.telegram?.botUsername ||
    (runtime?.telegram ? await resolveTelegramBotUsername(runtime.telegram.botToken) : null)
  return {
    ...publicStatusFromRuntime(runtime, botUsername),
    hasWhatsapp: false,
    tenantId: actor.tenantId,
  }
}

export async function getAssistantConfigForCurrentTenant() {
  const actor = await requireActor(['ADMIN', 'MANAGER'])
  return getTenantAssistantForm(actor.tenantId)
}

export async function updateTenantAssistantConfig(input: TenantAssistantInput) {
  return safeAction(async () => {
    const actor = await requireActor(['ADMIN'])
    const update = {
      ...buildAssistantConfigUpdate(input),
      updatedAt: new Date(),
    }
    await db.update(schema.tenant).set(update).where(eq(schema.tenant.id, actor.tenantId))
    await logAudit(
      actor.tenantId,
      actor.userId,
      AuditAction.UPDATE,
      'tenant_assistant_config',
      actor.tenantId,
      {
        fields: Object.keys(update).filter((k) => k !== 'updatedAt'),
        // Nunca auditar valores de secretos
        secrets: 'redacted',
      }
    )
    revalidatePath('/dashboard/settings')
    return { success: true as const }
  }, 'No se pudo guardar la configuración del asistente.')
}

export async function listMyChannelLinks() {
  const actor = await requireActor(['ADMIN', 'MANAGER', 'CASHIER'])
  return listChannelLinks(actor.tenantId)
}

export async function generateTelegramLinkCode(channel: 'telegram' | 'whatsapp' = 'telegram') {
  return safeAction(async () => {
    const actor = await requireActor(['ADMIN', 'MANAGER', 'CASHIER'])
    const runtime = await getTenantAssistantRuntime(actor.tenantId)
    if (!runtime?.enabled) {
      return {
        success: false as const,
        message:
          'Active el asistente y guarde el token de Telegram de su empresa antes de vincular.',
      }
    }
    if (channel === 'telegram' && !runtime.telegram) {
      return {
        success: false as const,
        message: 'Guarde el TELEGRAM BOT TOKEN de su empresa en el formulario de arriba.',
      }
    }

    const result = await createChannelLinkCode(actor, channel)
    revalidatePath('/dashboard/settings')

    if (channel === 'whatsapp') {
      return {
        success: true as const,
        code: result.code,
        channel: result.channel,
        expiresAt: result.expiresAt.toISOString(),
        linkId: result.linkId,
        deepLink: null as string | null,
        instruction: `En WhatsApp envíe al bot: /vincular ${result.code}`,
      }
    }

    const botUsername =
      runtime.telegram?.botUsername ||
      (await resolveTelegramBotUsername(runtime.telegram!.botToken))
    const deepLink = botUsername
      ? buildTelegramStartLink(botUsername, result.code)
      : null

    return {
      success: true as const,
      code: result.code,
      channel: result.channel,
      expiresAt: result.expiresAt.toISOString(),
      linkId: result.linkId,
      deepLink,
      instruction: deepLink
        ? `Pulse “Abrir Telegram” o abra: ${deepLink}`
        : `En Telegram envíe al bot: /vincular ${result.code}`,
    }
  }, 'No se pudo generar el código de vinculación.')
}

export async function revokeAssistantChannelLink(linkId: string) {
  return safeAction(async () => {
    const actor = await requireActor(['ADMIN', 'MANAGER'])
    await revokeChannelLink(actor, linkId)
    revalidatePath('/dashboard/settings')
    return { success: true as const }
  }, 'No se pudo revocar el vínculo.')
}
