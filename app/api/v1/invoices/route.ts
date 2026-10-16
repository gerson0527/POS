import { db } from '@/lib/db'
import { fiscalDocument } from '@/lib/db/schema'
import { validateAPIKey } from '@/lib/api/public-api'
import { jsonError, parseJsonBody, parseQueryParams } from '@/lib/api/http'
import { AppError } from '@/lib/errors'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

// Fase 3.22: validación zod de query/body en lugar de lecturas manuales.
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.string().min(1).optional(),
})

const createInvoiceSchema = z.object({
  saleId: z.string().min(1, 'saleId es requerido'),
  cufe: z.string().min(1, 'cufe es requerido'),
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
      .select()
      .from(fiscalDocument)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset)

    return Response.json({
      data: invoices,
      total: invoices.length,
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

    // Create invoice (simplified) — Fase 4.24: modelo fiscal único (fiscal_document).
    const newInvoice = {
      id: `fdoc_${Date.now()}`,
      tenantId: validation.tenantId,
      saleId: body.saleId,
      uniqueCode: body.cufe,
      status: 'PENDING_GENERATION',
    }

    return Response.json({ data: newInvoice }, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
