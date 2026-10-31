import { and, eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { emitSaleElectronicInvoice } from '@/lib/invoicing/emit-invoice'

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface OutboxRow {
  id: string
  tenantId: string
  saleId: string
  eventType: string
  attempts: number
  maxAttempts: number
  requiresManualApproval: boolean
  needsReconciliation: boolean
}

interface EnqueueOptions {
  /** MANUAL: el cron automático no debe tomar el evento. */
  requiresManualApproval?: boolean
}

/** Encola la emisión fiscal dentro de la misma transacción que confirma la venta. */
export async function enqueueFiscalEmission(
  tx: DbTransaction,
  tenantId: string,
  saleId: string,
  options: EnqueueOptions = {}
): Promise<void> {
  await tx
    .insert(schema.fiscalOutbox)
    .values({
      id: `outbox_${randomUUID()}`,
      tenantId,
      saleId,
      eventType: 'EMIT_INVOICE',
      status: 'PENDING',
      nextAttemptAt: new Date(),
      requiresManualApproval: options.requiresManualApproval ?? false,
    })
    .onConflictDoNothing()
}

async function enqueueStandalone(
  tenantId: string,
  saleId: string,
  requiresManualApproval = false
): Promise<void> {
  await db
    .insert(schema.fiscalOutbox)
    .values({
      id: `outbox_${randomUUID()}`,
      tenantId,
      saleId,
      eventType: 'EMIT_INVOICE',
      status: 'PENDING',
      nextAttemptAt: new Date(),
      requiresManualApproval,
    })
    .onConflictDoNothing()
}

/**
 * Reclama eventos pendientes de forma atómica. `FOR UPDATE SKIP LOCKED` permite
 * varios workers sin procesar el mismo evento dos veces. Los eventos en modo
 * MANUAL quedan excluidos hasta que la contadora los transmita explícitamente.
 */
async function claimPending(limit: number): Promise<OutboxRow[]> {
  const result: any = await db.execute(sql`
    UPDATE "fiscal_outbox"
    SET "status" = 'PROCESSING', "lockedAt" = now(), "updatedAt" = now()
    WHERE "id" IN (
      SELECT "id" FROM "fiscal_outbox"
      WHERE "attempts" < "maxAttempts"
        AND "requiresManualApproval" = false
        AND (
          ("status" = 'PENDING' AND "nextAttemptAt" <= now())
          OR ("status" = 'PROCESSING' AND "lockedAt" < now() - interval '10 minutes')
        )
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "tenantId", "saleId", "eventType", "attempts", "maxAttempts",
              "requiresManualApproval", "needsReconciliation"
  `)
  const rows = result?.rows ?? result ?? []
  return rows.map((r: any) => ({
    id: String(r.id),
    tenantId: String(r.tenantId),
    saleId: String(r.saleId),
    eventType: String(r.eventType),
    attempts: Number(r.attempts ?? 0),
    maxAttempts: Number(r.maxAttempts ?? 10),
    requiresManualApproval: Boolean(r.requiresManualApproval),
    needsReconciliation: Boolean(r.needsReconciliation),
  }))
}

async function markDone(row: OutboxRow): Promise<void> {
  await db
    .update(schema.fiscalOutbox)
    .set({
      status: 'DONE',
      attempts: row.attempts + 1,
      lockedAt: null,
      lastError: null,
      needsReconciliation: false,
      requiresManualApproval: false,
      updatedAt: new Date(),
    })
    .where(eq(schema.fiscalOutbox.id, row.id))
}

async function markFailed(
  row: OutboxRow,
  error: string,
  needsReconciliation = false
): Promise<void> {
  const attempts = row.attempts + 1
  const exhausted = attempts >= row.maxAttempts
  // Backoff en minutos usando now() de Postgres: evita el desfase de
  // timestamp without time zone vs Date de Node (UTC vs America/Bogota).
  const backoffMinutes = Math.min(60, 2 ** Math.min(attempts, 6))
  await db
    .update(schema.fiscalOutbox)
    .set({
      status: exhausted ? 'FAILED' : 'PENDING',
      attempts,
      lockedAt: null,
      lastError: error.slice(0, 2000),
      nextAttemptAt: sql`now() + (${backoffMinutes} * interval '1 minute')`,
      needsReconciliation: row.needsReconciliation || needsReconciliation,
      updatedAt: new Date(),
    })
    .where(eq(schema.fiscalOutbox.id, row.id))
}

/**
 * Procesa hasta `limit` eventos fiscales pendientes. Cada intento usa el mismo
 * `reference_code` por venta, por lo que un reintento nunca duplica la factura
 * en Factus/DIAN. Si el intento anterior fue incierto, primero reconcilia.
 */
export async function processFiscalOutbox(limit = 5): Promise<{
  processed: number
  succeeded: number
  failed: number
}> {
  const rows = await claimPending(Math.max(1, Math.min(limit, 50)))
  let succeeded = 0
  let failed = 0

  for (const row of rows) {
    try {
      const result = await emitSaleElectronicInvoice(row.saleId, row.tenantId, {
        reconcileFirst: row.needsReconciliation,
      })
      // Solo DONE con CUFE persistido: success sin uniqueCode dejaría la venta
      // "en cola" eternamente como transmitida cuando en realidad no hay documento.
      if (result.success && result.cufe) {
        await markDone(row)
        succeeded++
      } else if (result.success && !result.cufe) {
        await markFailed(
          row,
          result.message ||
            'Factus respondió OK pero no hay CUFE persistido localmente; se reintentará.',
          true
        )
        failed++
      } else {
        await markFailed(
          row,
          result.message || 'Emisión fiscal fallida',
          result.needsReconciliation ?? false
        )
        failed++
      }
    } catch (err: any) {
      // Excepción inesperada: el resultado externo es incierto por definición.
      await markFailed(row, err?.message || 'Error inesperado en outbox fiscal', true)
      failed++
    }
  }

  return { processed: rows.length, succeeded, failed }
}

/** Reintenta manualmente la emisión de una venta concreta del tenant. */
export async function retryFiscalEmission(
  tenantId: string,
  saleId: string,
  options: { requestedBy?: string | null; force?: boolean } = {}
): Promise<{
  success: boolean
  message: string
  cufe?: string
  dianStatus?: string
  needsReconciliation?: boolean
}> {
  const tenantRows = await db
    .select({ mode: schema.tenant.dianTransmissionMode })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, tenantId))
    .limit(1)
  const manualMode = tenantRows[0]?.mode === 'MANUAL'

  const existing = await db
    .select({ id: schema.fiscalOutbox.id })
    .from(schema.fiscalOutbox)
    .where(
      and(
        eq(schema.fiscalOutbox.tenantId, tenantId),
        eq(schema.fiscalOutbox.saleId, saleId),
        eq(schema.fiscalOutbox.eventType, 'EMIT_INVOICE')
      )
    )
    .limit(1)

  // Ventas anteriores a la introducción del outbox: se crea el evento para que
  // la emisión manual también pase por el claim transaccional.
  if (!existing.length) {
    await enqueueStandalone(tenantId, saleId, manualMode)
  }

  const statusClause = options.force
    ? sql`(
        ${schema.fiscalOutbox.status} IN ('PENDING', 'FAILED', 'DONE')
        OR (${schema.fiscalOutbox.status} = 'PROCESSING'
          AND ${schema.fiscalOutbox.lockedAt} < now() - interval '10 minutes')
      )`
    : sql`(
        ${schema.fiscalOutbox.status} IN ('PENDING', 'FAILED')
        OR (${schema.fiscalOutbox.status} = 'PROCESSING'
          AND ${schema.fiscalOutbox.lockedAt} < now() - interval '10 minutes')
      )`

  const claimed = await db
    .update(schema.fiscalOutbox)
    .set({
      status: 'PROCESSING',
      lockedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.fiscalOutbox.tenantId, tenantId),
        eq(schema.fiscalOutbox.saleId, saleId),
        eq(schema.fiscalOutbox.eventType, 'EMIT_INVOICE'),
        statusClause
      )
    )
    .returning({
      id: schema.fiscalOutbox.id,
      attempts: schema.fiscalOutbox.attempts,
      maxAttempts: schema.fiscalOutbox.maxAttempts,
      requiresManualApproval: schema.fiscalOutbox.requiresManualApproval,
      needsReconciliation: schema.fiscalOutbox.needsReconciliation,
    })

  if (!claimed.length) {
    return { success: false, message: 'La emisión fiscal ya está en proceso.' }
  }

  const row: OutboxRow = {
    id: claimed[0].id,
    tenantId,
    saleId,
    eventType: 'EMIT_INVOICE',
    attempts: Number(claimed[0].attempts ?? 0),
    maxAttempts: Number(claimed[0].maxAttempts ?? 10),
    requiresManualApproval: Boolean(claimed[0].requiresManualApproval),
    needsReconciliation: Boolean(claimed[0].needsReconciliation),
  }

  let result: Awaited<ReturnType<typeof emitSaleElectronicInvoice>>
  try {
    result = await emitSaleElectronicInvoice(saleId, tenantId, {
      requestedBy: options.requestedBy ?? null,
      reconcileFirst: row.needsReconciliation,
    })
  } catch (error) {
    result = {
      success: false,
      message: error instanceof Error ? error.message : 'Error inesperado en emisión fiscal',
      needsReconciliation: true,
    }
  }

  if (result.success && result.cufe) {
    await markDone(row)
  } else {
    const attempts = row.attempts + 1
    const exhausted = attempts >= row.maxAttempts
    const message =
      result.success && !result.cufe
        ? result.message ||
          'Factus respondió OK pero no hay CUFE persistido localmente; se reintentará.'
        : result.message
    await db
      .update(schema.fiscalOutbox)
      .set({
        status: exhausted ? 'FAILED' : 'PENDING',
        attempts: sql`${schema.fiscalOutbox.attempts} + 1`,
        nextAttemptAt: sql`now() + interval '1 minute'`,
        lockedAt: null,
        lastError: message.slice(0, 2000),
        needsReconciliation:
          row.needsReconciliation ||
          (result.needsReconciliation ?? false) ||
          Boolean(result.success && !result.cufe),
        // Si la empresa está en MANUAL, un fallo manual no debe pasar al cron:
        // la contadora decide cuándo reintentar.
        requiresManualApproval: manualMode,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.fiscalOutbox.tenantId, tenantId),
          eq(schema.fiscalOutbox.saleId, saleId),
          eq(schema.fiscalOutbox.eventType, 'EMIT_INVOICE')
        )
      )
  }

  return result
}
