// emit-invoice.ts — Lógica de dominio de emisión electrónica a DIAN vía Factus.
// Fase 4.25 (§5.2): el action app/actions/factus-service.ts queda como cascarón
// (sesión + llamada + retorno); aquí vive la orquestación: venta → provider →
// idempotencia → persistencia en fiscal_document (modelo único desde Fase 4.24).

import { and, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { mapFiscalStatus } from '@/lib/catalogs/dian-status'
import { getInvoiceProvider } from './index'
import { buildInvoicePayload } from './build-bill'

export async function emitSaleElectronicInvoice(saleId: string, tenantId?: string) {
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
    if (!sale) return { success: false, message: 'Venta no encontrada.' }

    const provider = await getInvoiceProvider(sale.tenantId)
    if (!provider) {
      return {
        success: false,
        message:
          'No hay proveedor de facturación electrónica configurado para este tenant. Configúrelo en /dashboard/settings.',
      }
    }

    // Idempotencia: si esta venta ya tiene documento fiscal con CUFE, NO se vuelve a
    // transmitir (evita facturas duplicadas ante reintentos o doble llamada
    // completeSale + página POS, ambas con el mismo reference_code).
    const existingDocs = await db
      .select()
      .from(schema.fiscalDocument)
      .where(
        and(
          eq(schema.fiscalDocument.saleId, saleId),
          eq(schema.fiscalDocument.tenantId, sale.tenantId)
        )
      )
      .orderBy(desc(schema.fiscalDocument.createdAt))
      .limit(1)
    const existing = existingDocs[0]
    if (existing?.uniqueCode) {
      const rejected =
        existing.status === 'REJECTED' || existing.status === 'TECHNICAL_FAILURE'
      return {
        success: !rejected,
        cufe: existing.uniqueCode,
        qrCodeUrl: existing.qrCodeContent || undefined,
        pdfUrl: existing.pdfStorageKey || undefined,
        xmlUrl: existing.xmlSignedStorageKey || undefined,
        dianStatus: existing.status,
        billNumber: existing.fullNumber || undefined,
        message: rejected
          ? `El documento ${existing.fullNumber || existing.uniqueCode} fue rechazado o falló técnicamente (${existing.status}). No se reenvía automáticamente: requiere corrección y una nueva numeración/nota de crédito.`
          : `La venta ya estaba transmitida a DIAN (documento ${existing.fullNumber || existing.uniqueCode}). No se envió una nueva factura.`,
      }
    }

    const payload = await buildInvoicePayload({
      saleId,
      tenantId: sale.tenantId,
      numberingRangeId: provider.numberingRangeId,
    })
    const result = await provider.sendInvoice(payload)

    if (result.success && result.cufe) {
      // Fase 4.24: fiscal_document es el modelo único. Si generateInvoice ya creó
      // el documento local (sin uniqueCode), se COMPLETA con los datos de Factus;
      // si no existe, se inserta uno nuevo.
      const fiscalValues = {
        documentType: 'FACTURA_ELECTRONICA_VENTA',
        technicalVersion: '1.0',
        status: mapFiscalStatus(result.dianStatus),
        prefix: 'FACT',
        consecutive: String(sale.ticketNumber || 1),
        fullNumber: result.billNumber || payload.reference_code,
        uniqueCode: result.cufe,
        issueDate: new Date(),
        issueTime: new Date().toLocaleTimeString('es-CO'),
        issuerSnapshot: { tenantId: sale.tenantId },
        customerSnapshot: payload.customer,
        totalsSnapshot: {
          total: sale.total,
          subtotal: sale.subtotal,
          taxAmount: sale.taxAmount,
          discountAmount: sale.discountAmount,
        },
        paymentSnapshot: payload.payment_details,
        // El campo real de InvoiceResult es `qrCodeUrl` (URL de verificación DIAN
        // que Factus retorna en bill.qr / links.qr). El lector anterior
        // `(result as any).qrUrl` no existía y siempre guardaba null en BD.
        qrCodeContent: result.qrCodeUrl || null,
        pdfStorageKey: result.pdfUrl || null,
        xmlSignedStorageKey: result.xmlUrl || null,
        correlationId: `corr_${Date.now()}`,
      }
      try {
        if (existing) {
          await db
            .update(schema.fiscalDocument)
            .set(fiscalValues)
            .where(
              and(
                eq(schema.fiscalDocument.id, existing.id),
                eq(schema.fiscalDocument.tenantId, sale.tenantId)
              )
            )
        } else {
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

          if (!inserted.length) {
            // Otra emisión concurrente insertó el documento primero:
            // se completa ese registro en lugar de perder los datos de Factus.
            await db
              .update(schema.fiscalDocument)
              .set(fiscalValues)
              .where(
                and(
                  eq(schema.fiscalDocument.saleId, sale.id),
                  eq(schema.fiscalDocument.tenantId, sale.tenantId)
                )
              )
          }
        }
      } catch (dbErr: any) {
        // La factura YA quedó aceptada por DIAN: no reportarla como "no transmitida"
        // (eso provocaría reintentos que generarían facturas duplicadas).
        console.error(
          '[emitFactusElectronicInvoice] factura emitida en DIAN pero falló el registro local:',
          dbErr
        )
        return {
          ...result,
          message: `${result.message}\n\nâš  La factura se emitió correctamente en DIAN, pero no se pudo guardar el registro local (${dbErr?.message ?? 'error de BD'}).`,
        }
      }
    }

    return result
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Error en la transmisión a la DIAN.',
    }
  }
}
