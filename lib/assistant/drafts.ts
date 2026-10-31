import { randomBytes } from 'node:crypto'
import { and, eq, gt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import type { ResolvedIntent } from './resolve'

export async function createDraft(params: {
  tenantId: string
  userId: string
  channelLinkId: string
  channelMessageId?: string | null
  resolved: ResolvedIntent
  summary: string
  ttlMinutes: number
}) {
  // IDs cortos: callback_data de Telegram máximo 64 bytes.
  const id = `d_${randomBytes(8).toString('hex')}`
  const expiresAt = new Date(Date.now() + params.ttlMinutes * 60_000)
  const hasBlockers = params.resolved.blockers.length > 0
  const intentType = params.resolved.intent.type
  const status =
    hasBlockers || intentType === 'CLARIFY' || intentType === 'UNSUPPORTED'
      ? 'AWAITING_CLARIFICATION'
      : intentType === 'STOCK_QUERY'
        ? 'DONE'
        : 'PENDING'

  await db.insert(schema.assistantDraft).values({
    id,
    tenantId: params.tenantId,
    userId: params.userId,
    channelLinkId: params.channelLinkId,
    channelMessageId: params.channelMessageId ?? null,
    intent: intentType,
    extractedJson: params.resolved.intent as any,
    resolvedJson: params.resolved as any,
    summary: params.summary,
    status,
    expiresAt,
  })

  return { id, status, expiresAt }
}

export async function getDraft(tenantId: string, draftId: string) {
  const rows = await db
    .select()
    .from(schema.assistantDraft)
    .where(
      and(
        eq(schema.assistantDraft.id, draftId),
        eq(schema.assistantDraft.tenantId, tenantId)
      )
    )
    .limit(1)
  return rows[0] ?? null
}

/** Transición atómica PENDING → EXECUTING (idempotencia de confirmación). */
export async function claimDraft(params: {
  tenantId: string
  userId: string
  draftId: string
}) {
  const updated = await db
    .update(schema.assistantDraft)
    .set({ status: 'EXECUTING', updatedAt: new Date() })
    .where(
      and(
        eq(schema.assistantDraft.id, params.draftId),
        eq(schema.assistantDraft.tenantId, params.tenantId),
        eq(schema.assistantDraft.userId, params.userId),
        eq(schema.assistantDraft.status, 'PENDING'),
        gt(schema.assistantDraft.expiresAt, sql`now()`)
      )
    )
    .returning()
  return updated[0] ?? null
}

export async function cancelDraft(params: {
  tenantId: string
  userId: string
  draftId: string
}) {
  const updated = await db
    .update(schema.assistantDraft)
    .set({ status: 'CANCELLED', updatedAt: new Date() })
    .where(
      and(
        eq(schema.assistantDraft.id, params.draftId),
        eq(schema.assistantDraft.tenantId, params.tenantId),
        eq(schema.assistantDraft.userId, params.userId),
        sql`${schema.assistantDraft.status} IN ('PENDING', 'AWAITING_CLARIFICATION')`
      )
    )
    .returning({ id: schema.assistantDraft.id })
  return Boolean(updated[0])
}

export async function markDraftDone(draftId: string, resultRef: string) {
  await db
    .update(schema.assistantDraft)
    .set({
      status: 'DONE',
      resultRef,
      confirmedAt: new Date(),
      updatedAt: new Date(),
      errorMessage: null,
    })
    .where(eq(schema.assistantDraft.id, draftId))
}

export async function markDraftFailed(draftId: string, errorMessage: string) {
  await db
    .update(schema.assistantDraft)
    .set({
      status: 'FAILED',
      errorMessage: errorMessage.slice(0, 1000),
      updatedAt: new Date(),
    })
    .where(eq(schema.assistantDraft.id, draftId))
}

export async function updateDraftResolved(params: {
  tenantId: string
  userId: string
  draftId: string
  resolved: ResolvedIntent
  summary: string
  status: 'PENDING' | 'AWAITING_CLARIFICATION'
}) {
  const updated = await db
    .update(schema.assistantDraft)
    .set({
      resolvedJson: params.resolved as any,
      summary: params.summary,
      status: params.status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.assistantDraft.id, params.draftId),
        eq(schema.assistantDraft.tenantId, params.tenantId),
        eq(schema.assistantDraft.userId, params.userId),
        sql`${schema.assistantDraft.status} IN ('PENDING', 'AWAITING_CLARIFICATION')`
      )
    )
    .returning()
  return updated[0] ?? null
}
