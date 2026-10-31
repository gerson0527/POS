// emit-invoice.ts — Lógica de dominio de emisión electrónica a DIAN vía Factus.
// Fase 4.25 (§5.2): el action app/actions/factus-service.ts queda como cascarón
// (sesión + llamada + retorno); aquí vive la orquestación: venta → provider →
// idempotencia → reconciliación → persistencia en fiscal_document.

import { and, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { mapFiscalStatus } from '@/lib/catalogs/dian-status'
import { getInvoiceProvider } from './index'
import { buildInvoicePayload, buildInvoiceReference } from './build-bill'
import { parseFiscalBillNumber } from './factus-mappers'
import type { InvoicePayload, InvoiceResult } from './types'

interface EmitOptions {
  /** Consulta a Factus por reference_code antes de reenviar (resultado incierto). */
  reconcileFirst?: boolean
  /** Usuario que solicita la emisión (auditoría). El cron/outbox no tiene usuario. */
  requestedBy?: string | null
}

/**
 * Persiste el resultado de Factus sin pisar el comprobante interno REC.
 * `fiscal_document` guarda una fila electrónica independiente por venta.
 */
async function persistFiscalDocument(input: {
  sale: any
  existingElectronic: any | null
  result: InvoiceResult
  payload: InvoicePayload | null
  correlationId: string
}): Promise<void> {
  const { sale, existingElectronic, result, payload, correlationId } = input
  const fiscalNumber = parseFiscalBillNumber(result.billNumber)
  const fiscalValues = {
    documentType: 'FACTURA_ELECTRONICA_VENTA',
    technicalVersion: '1.0',
    status: mapFiscalStatus(result.dianStatus),
    prefix: fiscalNumber.prefix ?? null,
    consecutive: fiscalNumber.consecutive ?? null,
    fullNumber: result.billNumber
      ? String(result.billNumber)
      : payload?.reference_code || buildInvoiceReference(sale.id),
    uniqueCode: result.cufe,
    issueDate: new Date(),
    issueTime: new Date().toLocaleTimeString('es-CO'),
    issuerSnapshot: { tenantId: sale.tenantId },
    customerSnapshot:
      payload?.customer ?? {
        documentType: sale.customerDocType,
        documentNumber: sale.customerDocNumber,
        name: sale.customerName,
        email: sale.customerEmail,
        phone: sale.customerPhone,
        address: sale.customerAddress,
      },
    totalsSnapshot: {
      total: sale.total,
      subtotal: sale.subtotal,
      taxAmount: sale.taxAmount,
      discountAmount: sale.discountAmount,
    },
    paymentSnapshot: payload?.payment_details ?? [],
    itemsSnapshot: payload?.items ?? null,
    qrCodeContent: result.qrCodeUrl || null,
    pdfStorageKey: result.pdfUrl || null,
    xmlSignedStorageKey: result.xmlUrl || null,
    correlationId,
    updatedAt: new Date(),
  }

  if (existingElectronic) {
    const updated = await db
      .update(schema.fiscalDocument)
      .set(fiscalValues)
      .where(
        and(
          eq(schema.fiscalDocument.id, existingElectronic.id),
          eq(schema.fiscalDocument.tenantId, sale.tenantId)
        )
      )
      .returning({ id: schema.fiscalDocument.id })
    if (!updated.length) {
      throw new Error('No se pudo actualizar el documento fiscal electrónico existente.')
    }
    return
  }

  const inserted = await db
    .insert(schema.fiscalDocument)
    .values({
      id: `fdoc_${randomUUID()}`,
      tenantId: sale.tenantId,
      branchId: sale.locationId || 'main_branch',
      saleId: sale.id,
      ...fiscalValues,
    })
    .onConflictDoNothing()
    .returning({ id: schema.fiscalDocument.id })

  if (inserted.length) return

  // Conflictos posibles:
  // 1) Emisión concurrente ya creó FACTURA_ELECTRONICA_VENTA → completar esa fila.
  // 2) Índice legado único por saleId (solo REC existe) → actualizar esa fila a
  //    factura electrónica para no perder el CUFE de Factus.
  const updatedElectronic = await db
    .update(schema.fiscalDocument)
    .set(fiscalValues)
    .where(
      and(
        eq(schema.fiscalDocument.saleId, sale.id),
        eq(schema.fiscalDocument.tenantId, sale.tenantId),
        eq(schema.fiscalDocument.documentType, 'FACTURA_ELECTRONICA_VENTA')
      )
    )
    .returning({ id: schema.fiscalDocument.id })

  if (updatedElectronic.length) return

  const upgraded = await db
    .update(schema.fiscalDocument)
    .set(fiscalValues)
    .where(
      and(
        eq(schema.fiscalDocument.saleId, sale.id),
        eq(schema.fiscalDocument.tenantId, sale.tenantId)
      )
    )
    .returning({ id: schema.fiscalDocument.id })

  if (!upgraded.length) {
    throw new Error(
      'La factura se emitió en Factus pero no se pudo persistir el documento fiscal local.'
    )
  }
}

/** Auditoría de la transmisión fiscal (no rompe la emisión si falla el log). */
async function writeFiscalAudit(input: {
  tenantId: string
  saleId: string
  userId?: string | null
  correlationId: string
  referenceCode: string
  result: InvoiceResult
  error?: string
}): Promise<void> {
  try {
    await db.insert(schema.auditLog).values({
      id: `audit_${randomUUID()}`,
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      action: 'SEND_DIAN',
      entity: 'fiscal_document',
      entityId: input.saleId,
      changes: {
        saleId: input.saleId,
        referenceCode: input.referenceCode,
        success: input.result.success,
        dianStatus: input.result.dianStatus ?? null,
        cufe: input.result.cufe ?? null,
        billNumber: input.result.billNumber ?? null,
        providerId: input.result.providerId ?? null,
        error: input.error ?? (input.result.success ? null : input.result.message),
        needsReconciliation: input.result.needsReconciliation ?? false,
      },
      metadata: { correlationId: input.correlationId },
    })
  } catch (auditErr: any) {
    console.error('[fiscal] no se pudo registrar la auditoría de emisión:', auditErr?.message ?? auditErr)
  }
}

export async function emitSaleElectronicInvoice(
  saleId: string,
  tenantId?: string,
  options: EmitOptions = {}
): Promise<InvoiceResult> {
  const correlationId = `corr_${randomUUID()}`

  try {
    const saleRows = await db
      .select()
      .from(schema.sale)
      .where(
        tenantId
          ? and(eq(schema.sale.id, saleId), eq(schema.sale.tenantId, tenantId))
          : eq(schema.sale.id, saleId)
      )
      .limit(1)
    const sale = saleRows[0]
    if (!sale) return { success: false, message: 'Venta no encontrada.', correlationId }

    const documentRows = await db
      .select()
      .from(schema.fiscalDocument)
      .where(
        and(
          eq(schema.fiscalDocument.saleId, saleId),
          eq(schema.fiscalDocument.tenantId, sale.tenantId)
        )
      )
      .orderBy(desc(schema.fiscalDocument.createdAt))

    // Idempotencia: cualquier documento de esta venta con CUFE ya fue transmitido.
    // (Se busca por CUFE, no solo por tipo, para cubrir datos heredados.)
    const existingWithCufe = documentRows.find((doc) => doc.uniqueCode)
    if (existingWithCufe) {
      const rejected =
        existingWithCufe.status === 'REJECTED' ||
        existingWithCufe.status === 'TECHNICAL_FAILURE'
      return {
        success: !rejected,
        cufe: existingWithCufe.uniqueCode ?? undefined,
        qrCodeUrl: existingWithCufe.qrCodeContent || undefined,
        pdfUrl: existingWithCufe.pdfStorageKey || undefined,
        xmlUrl: existingWithCufe.xmlSignedStorageKey || undefined,
        dianStatus: existingWithCufe.status,
        billNumber: existingWithCufe.fullNumber || undefined,
        correlationId,
        message: rejected
          ? `El documento ${
              existingWithCufe.fullNumber || existingWithCufe.uniqueCode
            } fue rechazado o falló técnicamente (${
              existingWithCufe.status
            }). No se reenvía automáticamente: requiere corrección y una nueva numeración/nota de crédito.`
          : `La venta ya estaba transmitida a DIAN (documento ${
              existingWithCufe.fullNumber || existingWithCufe.uniqueCode
            }). No se envió una nueva factura.`,
      }
    }

    // Solo se emiten ventas completadas (nunca DRAFT/CANCELLED/REFUNDED).
    if (String(sale.status || '').toUpperCase() !== 'COMPLETED') {
      return {
        success: false,
        message: `Solo se pueden emitir ventas COMPLETADAS. Estado actual: ${sale.status}.`,
        correlationId,
      }
    }

    const provider = await getInvoiceProvider(sale.tenantId)
    if (!provider) {
      return {
        success: false,
        code: 'NO_PROVIDER',
        message:
          'Facturación electrónica no configurada. La venta queda como comprobante POS (sin DIAN).',
        correlationId,
      }
    }

    const existingElectronic =
      documentRows.find((doc) => doc.documentType === 'FACTURA_ELECTRONICA_VENTA') ?? null
    const referenceCode = buildInvoiceReference(sale.id)
    let result: InvoiceResult | null = null
    let payload: InvoicePayload | null = null

    // Reconciliación: si el intento anterior pudo haber emitido (timeout/red/fallo
    // local), se consulta por referencia antes de volver a crear la factura.
    if (options.reconcileFirst && provider.lookupBillByReference) {
      try {
        const remote = await provider.lookupBillByReference(referenceCode)
        if (remote?.cufe) result = remote
      } catch (err: any) {
        console.warn(
          `[fiscal] reconciliación de ${referenceCode} falló; se intentará emitir:`,
          err?.message ?? err
        )
      }
    }

    if (!result) {
      // Las validaciones previas lanzan un error accionable ANTES de llamar a Factus.
      try {
        payload = await buildInvoicePayload({
          saleId,
          tenantId: sale.tenantId,
          numberingRangeId: provider.numberingRangeId,
        })
      } catch (validationErr: any) {
        const failure: InvoiceResult = {
          success: false,
          message:
            validationErr?.message ||
            'La venta no cumple las validaciones para facturación electrónica.',
          providerId: provider.providerId,
          correlationId,
        }
        await writeFiscalAudit({
          tenantId: sale.tenantId,
          saleId,
          userId: options.requestedBy,
          correlationId,
          referenceCode,
          result: failure,
        })
        return failure
      }

      try {
        result = await provider.sendInvoice(payload)
      } catch (err: any) {
        const failure: InvoiceResult = {
          success: false,
          message: err?.message || 'Error inesperado al emitir la factura electrónica.',
          providerId: provider.providerId,
          uncertain: true,
          needsReconciliation: true,
          correlationId,
        }
        await writeFiscalAudit({
          tenantId: sale.tenantId,
          saleId,
          userId: options.requestedBy,
          correlationId,
          referenceCode,
          result: failure,
        })
        return failure
      }
    }

    result.correlationId = correlationId

    if (result.success && result.cufe) {
      // Para una emisión recuperada por reconciliación, el payload puede no
      // haberse construido aún (o puede fallar por datos actuales). El CUFE
      // remoto es la fuente de verdad y debe persistirse igual.
      if (!payload) {
        try {
          payload = await buildInvoicePayload({
            saleId,
            tenantId: sale.tenantId,
            numberingRangeId: provider.numberingRangeId,
          })
        } catch (payloadErr: any) {
          console.warn(
            `[fiscal] factura ${referenceCode} recuperada sin snapshot completo:`,
            payloadErr?.message ?? payloadErr
          )
        }
      }

      try {
        await persistFiscalDocument({
          sale,
          existingElectronic,
          result,
          payload,
          correlationId,
        })
      } catch (dbErr: any) {
        // La factura YA quedó aceptada por DIAN: no reportarla como "no
        // transmitida" sin marcar el evento para reconciliación. El outbox
        // mantiene el evento PENDING y el siguiente intento consulta por
        // reference_code, sin reenviar.
        console.error(
          '[emitSaleElectronicInvoice] factura emitida en DIAN pero falló el registro local:',
          dbErr
        )
        const failure: InvoiceResult = {
          ...result,
          success: false,
          needsReconciliation: true,
          message: `${result.message}\n\n⚠ La factura se emitió correctamente en DIAN, pero no se pudo guardar el registro local (${
            dbErr?.message ?? 'error de BD'
          }). Se recuperará automáticamente por referencia.`,
          correlationId,
        }
        await writeFiscalAudit({
          tenantId: sale.tenantId,
          saleId,
          userId: options.requestedBy,
          correlationId,
          referenceCode,
          result: failure,
        })
        return failure
      }

      await writeFiscalAudit({
        tenantId: sale.tenantId,
        saleId,
        userId: options.requestedBy,
        correlationId,
        referenceCode,
        result,
      })
      return result
    }

    await writeFiscalAudit({
      tenantId: sale.tenantId,
      saleId,
      userId: options.requestedBy,
      correlationId,
      referenceCode,
      result,
    })
    return { ...result, correlationId }
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Error en la transmisión a la DIAN.',
      correlationId,
    }
  }
}
