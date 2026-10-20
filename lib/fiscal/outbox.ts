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
}

/** Encola la emisión fiscal dentro de la misma transacción que confirma la venta. */
export async function enqueueFiscalEmission(
  tx: DbTransaction,
  tenantId: string,
  saleId: string
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
    })
    .onConflictDoNothing()
}

/**
 * Reclama eventos pendientes de forma atómica. `FOR UPDATE SKIP LOCKED` permite
 * varios workers sin procesar el mismo evento dos veces.
 */
async function claimPending(limit: number): Promise<OutboxRow[]> {
  const result: any = await db.execute(sql`
    UPDATE "fiscal_outbox"
    SET "status" = 'PROCESSING', "lockedAt" = now(), "updatedAt" = now()
    WHERE "id" IN (
      SELECT "id" FROM "fiscal_outbox"
      WHERE "attempts" < "maxAttempts"
        AND (
          ("status" = 'PENDING' AND "nextAttemptAt" <= now())
          OR ("status" = 'PROCESSING' AND "lockedAt" < now() - interval '10 minutes')
        )
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "tenantId", "saleId", "eventType", "attempts", "maxAttempts"
  `)
  const rows = result?.rows ?? result ?? []
  return rows.map((r: any) => ({
    id: String(r.id),
    tenantId: String(r.tenantId),
    saleId: String(r.saleId),
    eventType: String(r.eventType),
    attempts: Number(r.attempts ?? 0),
    maxAttempts: Number(r.maxAttempts ?? 10),
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
      updatedAt: new Date(),
    })
    .where(eq(schema.fiscalOutbox.id, row.id))
}

async function markFailed(row: OutboxRow, error: string): Promise<void> {
  const attempts = row.attempts + 1
  const exhausted = attempts >= row.maxAttempts
  const backoffMs = Math.min(60, 2 ** Math.min(attempts, 6)) * 60_000
  await db
    .update(schema.fiscalOutbox)
    .set({
      status: exhausted ? 'FAILED' : 'PENDING',
      attempts,
      lockedAt: null,
      lastError: error.slice(0, 2000),
      nextAttemptAt: new Date(Date.now() + backoffMs),
      updatedAt: new Date(),
    })
    .where(eq(schema.fiscalOutbox.id, row.id))
}

/**
 * Procesa hasta `limit` eventos fiscales pendientes. Cada intento usa el mismo
 * `reference_code` por venta, por lo que un reintento nunca duplica la factura
 * en Factus/DIAN.
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
      const result = await emitSaleElectronicInvoice(row.saleId, row.tenantId)
      if (result.success) {
        await markDone(row)
        succeeded++
      } else {
        await markFailed(row, result.message || 'Emisión fiscal fallida')
        failed++
      }
    } catch (err: any) {
      await markFailed(row, err?.message || 'Error inesperado en outbox fiscal')
      failed++
    }
  }

  return { processed: rows.length, succeeded, failed }
}

/** Reintenta manualmente la emisión de una venta concreta del tenant. */
export async function retryFiscalEmission(tenantId: string, saleId: string): Promise<{
  success: boolean
  message: string
}> {
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
        sql`(
          ${schema.fiscalOutbox.status} IN ('PENDING', 'FAILED')
          OR (${schema.fiscalOutbox.status} = 'PROCESSING'
            AND ${schema.fiscalOutbox.lockedAt} < now() - interval '10 minutes')
        )`
      )
    )
    .returning({ id: schema.fiscalOutbox.id })

  if (!claimed.length) {
    return { success: false, message: 'La emisión fiscal ya está en proceso.' }
  }

  let result: { success: boolean; message: string }
  try {
    result = await emitSaleElectronicInvoice(saleId, tenantId)
  } catch (error) {
    result = {
      success: false,
      message: error instanceof Error ? error.message : 'Error inesperado en emisión fiscal',
    }
  }

  await db
    .update(schema.fiscalOutbox)
    .set(
      result.success
        ? {
            status: 'DONE',
            lockedAt: null,
            lastError: null,
            updatedAt: new Date(),
          }
        : {
            status: 'PENDING',
            attempts: sql`${schema.fiscalOutbox.attempts} + 1`,
            nextAttemptAt: new Date(Date.now() + 60_000),
            lockedAt: null,
            lastError: result.message.slice(0, 2000),
            updatedAt: new Date(),
          }
    )
    .where(
      and(
        eq(schema.fiscalOutbox.tenantId, tenantId),
        eq(schema.fiscalOutbox.saleId, saleId),
        eq(schema.fiscalOutbox.eventType, 'EMIT_INVOICE')
      )
    )

  return result
}
