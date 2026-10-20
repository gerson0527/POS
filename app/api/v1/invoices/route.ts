import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { fiscalDocument, sale } from '@/lib/db/schema'
import { validateAPIKey } from '@/lib/api/public-api'
import { jsonError, parseJsonBody, parseQueryParams } from '@/lib/api/http'
import { AppError } from '@/lib/errors'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

// Fase 3.22: validación zod de query/body en lugar de lecturas manuales.
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.string().min(1).optional(),
})

const createInvoiceSchema = z.object({
  saleId: z.string().min(1, 'saleId es requerido'),
  cufe: z
    .string()
    .regex(/^[A-Fa-f0-9]{96}$/, 'cufe debe tener 96 caracteres hexadecimales'),
})

async function requireApiKey(request: Request, scope: 'read' | 'write') {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 'Missing API key.')
  }

  const apiKey = authHeader.slice(7)
  const validation = await validateAPIKey(apiKey)

  if (!validation.valid) {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired API key.')
  }

  if (!validation.scopes?.includes(scope)) {
    throw new AppError('FORBIDDEN', 'Insufficient permissions.')
  }

  return validation
}

export async function GET(request: Request) {
  try {
    const validation = await requireApiKey(request, 'read')

    const { limit, offset, status } = parseQueryParams(request, querySchema)

    const conditions = [eq(fiscalDocument.tenantId, validation.tenantId!)]
    if (status) {
      conditions.push(eq(fiscalDocument.status, status))
    }

    const invoices = await db
      .select({
        id: fiscalDocument.id,
        saleId: fiscalDocument.saleId,
        documentType: fiscalDocument.documentType,
        status: fiscalDocument.status,
        prefix: fiscalDocument.prefix,
        fullNumber: fiscalDocument.fullNumber,
        uniqueCode: fiscalDocument.uniqueCode,
        issueDate: fiscalDocument.issueDate,
        totalsSnapshot: fiscalDocument.totalsSnapshot,
        qrCodeContent: fiscalDocument.qrCodeContent,
        pdfStorageKey: fiscalDocument.pdfStorageKey,
        xmlSignedStorageKey: fiscalDocument.xmlSignedStorageKey,
        createdAt: fiscalDocument.createdAt,
      })
      .from(fiscalDocument)
      .where(and(...conditions))
      .orderBy(desc(fiscalDocument.createdAt))
      .limit(limit)
      .offset(offset)

    const countRows = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(fiscalDocument)
      .where(and(...conditions))

    return Response.json({
      data: invoices,
      total: Number(countRows[0]?.total ?? 0),
      limit,
      offset,
    })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    const validation = await requireApiKey(request, 'write')

    const body = await parseJsonBody(request, createInvoiceSchema)
    if (!body.cufe.trim()) {
      throw new AppError('VALIDATION_ERROR', 'El CUFE no puede estar vacío.')
    }

    const saleRows = await db
      .select({
        id: sale.id,
        subtotal: sale.subtotal,
        taxAmount: sale.taxAmount,
        total: sale.total,
        locationId: sale.locationId,
        status: sale.status,
      })
      .from(sale)
      .where(
        and(
          eq(sale.id, body.saleId),
          eq(sale.tenantId, validation.tenantId!)
        )
      )
      .limit(1)

    const saleRow = saleRows[0]
    if (!saleRow) throw new AppError('NOT_FOUND', 'La venta no existe en este tenant.')
    if (saleRow.status !== 'COMPLETED') {
      throw new AppError('CONFLICT', 'Solo se puede facturar una venta completada.')
    }

    const existingRows = await db
      .select()
      .from(fiscalDocument)
      .where(
        and(
          eq(fiscalDocument.tenantId, validation.tenantId!),
          eq(fiscalDocument.saleId, body.saleId),
          eq(fiscalDocument.documentType, 'FACTURA_ELECTRONICA_VENTA')
        )
      )
      .limit(1)

    const existing = existingRows[0]
    if (existing?.uniqueCode && existing.uniqueCode !== body.cufe.trim()) {
      throw new AppError(
        'CONFLICT',
        'La venta ya tiene un documento fiscal con otro CUFE.'
      )
    }

    const values = {
      status: 'ACCEPTED',
      uniqueCode: body.cufe.trim(),
      fullNumber: existing?.fullNumber || body.cufe.trim(),
      prefix: existing?.prefix || 'FACT',
      totalsSnapshot: {
        subtotal: saleRow.subtotal,
        taxAmount: saleRow.taxAmount,
        total: saleRow.total,
      },
      updatedAt: new Date(),
    }

    const saved = existing
      ? await db
          .update(fiscalDocument)
          .set(values)
          .where(
            and(
              eq(fiscalDocument.id, existing.id),
              eq(fiscalDocument.tenantId, validation.tenantId!)
            )
          )
          .returning()
      : await db
          .insert(fiscalDocument)
          .values({
            id: `fdoc_${randomUUID()}`,
            tenantId: validation.tenantId!,
            branchId: saleRow.locationId,
            saleId: body.saleId,
            documentType: 'FACTURA_ELECTRONICA_VENTA',
            ...values,
          })
          .returning()

    return Response.json({ data: saved[0] }, { status: existing ? 200 : 201 })
  } catch (error) {
    return jsonError(error)
  }
}
