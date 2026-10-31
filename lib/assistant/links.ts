import { randomBytes, randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import type { ActorContext } from '@/lib/auth/actor'
import { assertActorRole } from '@/lib/auth/actor'

const LINK_CODE_TTL_MINUTES = 30

function generateLinkCode(): string {
  // 8 chars mayúsculas/dígitos, fácil de dictar por voz/Telegram.
  return randomBytes(5).toString('hex').slice(0, 8).toUpperCase()
}

export async function createChannelLinkCode(
  actor: ActorContext,
  channel: 'telegram' | 'whatsapp' = 'telegram'
): Promise<{
  code: string
  expiresAt: Date
  linkId: string
  channel: 'telegram' | 'whatsapp'
}> {
  assertActorRole(actor, ['ADMIN', 'MANAGER', 'CASHIER'])

  // Invalida códigos PENDING previos del mismo usuario/canal.
  await db
    .update(schema.channelLink)
    .set({ status: 'REVOKED', linkCode: null, updatedAt: new Date() })
    .where(
      and(
        eq(schema.channelLink.tenantId, actor.tenantId),
        eq(schema.channelLink.userId, actor.userId),
        eq(schema.channelLink.channel, channel),
        eq(schema.channelLink.status, 'PENDING')
      )
    )

  const linkId = `clink_${randomUUID()}`
  const code = generateLinkCode()
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000)

  await db.insert(schema.channelLink).values({
    id: linkId,
    tenantId: actor.tenantId,
    userId: actor.userId,
    channel,
    status: 'PENDING',
    linkCode: code,
    expiresAt,
  })

  return { code, expiresAt, linkId, channel }
}

/** @deprecated use createChannelLinkCode */
export async function createTelegramLinkCode(actor: ActorContext) {
  return createChannelLinkCode(actor, 'telegram')
}

export async function listChannelLinks(tenantId: string) {
  return db
    .select({
      id: schema.channelLink.id,
      userId: schema.channelLink.userId,
      channel: schema.channelLink.channel,
      externalUserId: schema.channelLink.externalUserId,
      status: schema.channelLink.status,
      linkedAt: schema.channelLink.linkedAt,
      expiresAt: schema.channelLink.expiresAt,
      createdAt: schema.channelLink.createdAt,
    })
    .from(schema.channelLink)
    .where(eq(schema.channelLink.tenantId, tenantId))
    .orderBy(sql`${schema.channelLink.createdAt} DESC`)
}

export async function revokeChannelLink(actor: ActorContext, linkId: string) {
  assertActorRole(actor, ['ADMIN', 'MANAGER'])
  const updated = await db
    .update(schema.channelLink)
    .set({
      status: 'REVOKED',
      linkCode: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.channelLink.id, linkId),
        eq(schema.channelLink.tenantId, actor.tenantId)
      )
    )
    .returning({ id: schema.channelLink.id })
  if (!updated.length) throw new Error('Vínculo no encontrado.')
  return { success: true as const }
}

export async function findActiveLinkByExternal(channel: string, externalUserId: string) {
  const rows = await db
    .select()
    .from(schema.channelLink)
    .where(
      and(
        eq(schema.channelLink.channel, channel),
        eq(schema.channelLink.externalUserId, externalUserId),
        eq(schema.channelLink.status, 'ACTIVE')
      )
    )
    .limit(1)
  return rows[0] ?? null
}

/** Completa un PENDING con el chat de Telegram: `/vincular CODIGO` o deep link /start. */
export async function redeemLinkCode(params: {
  channel: string
  externalUserId: string
  code: string
  /** Si viene del bot de una empresa, el código debe ser de esa empresa. */
  expectedTenantId?: string
}): Promise<{ ok: true; tenantId: string; userId: string } | { ok: false; message: string }> {
  const code = params.code.trim().toUpperCase()
  if (!code) return { ok: false, message: 'Indique el código: /vincular ABC12345' }

  const rows = await db
    .select()
    .from(schema.channelLink)
    .where(
      and(
        eq(schema.channelLink.channel, params.channel),
        eq(schema.channelLink.linkCode, code),
        eq(schema.channelLink.status, 'PENDING')
      )
    )
    .limit(1)
  const link = rows[0]
  if (!link) {
    return {
      ok: false,
      message:
        'Código inválido o ya usado. En el panel genere UNO nuevo (Vincular con Telegram) ' +
        'y envíe de inmediato: /vincular CODIGO (sin generar otro antes).',
    }
  }
  if (params.expectedTenantId && link.tenantId !== params.expectedTenantId) {
    return { ok: false, message: 'Este código pertenece a otra empresa.' }
  }
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    await db
      .update(schema.channelLink)
      .set({ status: 'REVOKED', linkCode: null, updatedAt: new Date() })
      .where(eq(schema.channelLink.id, link.id))
    return { ok: false, message: 'El código expiró. Genere uno nuevo en Configuración.' }
  }

  const existing = await findActiveLinkByExternal(params.channel, params.externalUserId)
  if (existing && existing.id !== link.id) {
    return {
      ok: false,
      message: 'Este chat de Telegram ya está vinculado a otro usuario. Revóquelo primero.',
    }
  }

  try {
    await db
      .update(schema.channelLink)
      .set({
        externalUserId: params.externalUserId,
        status: 'ACTIVE',
        linkCode: null,
        linkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.channelLink.id, link.id))
  } catch {
    return { ok: false, message: 'No se pudo vincular (conflicto). Intente de nuevo.' }
  }

  return { ok: true, tenantId: link.tenantId, userId: link.userId }
}

export async function getMembershipRole(tenantId: string, userId: string) {
  const rows = await db
    .select({ role: schema.userTenant.role })
    .from(schema.userTenant)
    .where(
      and(
        eq(schema.userTenant.tenantId, tenantId),
        eq(schema.userTenant.userId, userId),
        eq(schema.userTenant.status, 'ACTIVE')
      )
    )
    .limit(1)
  return rows[0]?.role ?? null
}
