import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generateInventoryReport } from '@/lib/reports/pdf-generator'
import { jsonError, parseQueryParams, parseJsonBody } from '@/lib/api/http'
import { AppError } from '@/lib/errors'

// Fase 3.22: validación zod de los filtros de ubicación.
const querySchema = z.object({
  location: z.string().optional(),
})

const postSchema = z.object({
  location: z.string().optional(),
})

async function resolveTenantId(userId: string): Promise<string | null> {
  const memberships = await db
    .select({ tenantId: schema.userTenant.tenantId })
    .from(schema.userTenant)
    .where(
      and(
        eq(schema.userTenant.userId, userId),
        eq(schema.userTenant.status, 'ACTIVE')
      )
    )
    .limit(1)

  return memberships[0]?.tenantId ?? null
}

async function handleReport(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })

  try {
    const tenantId = await resolveTenantId(session.user.id)
    if (!tenantId) {
      return NextResponse.json({ error: 'El usuario no tiene un tenant asignado' }, { status: 403 })
    }

    // Filtros: GET (?location=...) o POST (body). Todo lo demás se resuelve en servidor.
    let locationId: string | null = null
    if (request.method === 'POST') {
      try {
        const body = await parseJsonBody(request, postSchema)
        locationId = body.location || null
      } catch (e) {
        // Body vacío/no-JSON: sin filtro (compatibilidad con el cliente actual).
        if (!(e instanceof AppError) || e.code !== 'BAD_REQUEST') throw e
      }
    } else {
      locationId = parseQueryParams(request, querySchema).location || null
    }

    // Marca del PDF SIEMPRE desde la BD, nunca desde el cliente.
    const tenants = await db
      .select({ legalName: schema.tenant.legalName, nit: schema.tenant.nit, name: schema.tenant.name })
      .from(schema.tenant)
      .where(eq(schema.tenant.id, tenantId))
      .limit(1)
    const tenantRow = tenants[0]

    let locationLabel = 'TODAS LAS UBICACIONES'
    const rows = await db
      .select({
        sku: schema.product.sku,
        name: schema.product.name,
        category: schema.product.category,
        cost: schema.product.cost,
        quantity: schema.inventory.quantity,
        locationId: schema.inventory.locationId,
      })
      .from(schema.inventory)
      .innerJoin(
        schema.product,
        and(
          eq(schema.inventory.productId, schema.product.id),
          eq(schema.product.tenantId, tenantId)
        )
      )
      .where(
        locationId
          ? and(eq(schema.inventory.tenantId, tenantId), eq(schema.inventory.locationId, locationId))
          : eq(schema.inventory.tenantId, tenantId)
      )

    if (locationId) {
      const locs = await db
        .select({ name: schema.location.name })
        .from(schema.location)
        .where(
          and(
            eq(schema.location.id, locationId),
            eq(schema.location.tenantId, tenantId)
          )
        )
        .limit(1)
      if (!locs.length) {
        return NextResponse.json({ error: 'Ubicación no encontrada' }, { status: 404 })
      }
      locationLabel = locs[0]?.name || 'UBICACIÓN'
    }

    const data = rows.map((r) => {
      const qty = Number(r.quantity || 0)
      const cost = Number(r.cost || 0)
      return {
        sku: r.sku,
        name: r.name,
        category: r.category || 'General',
        quantity: qty,
        cost,
        value: qty * cost,
      }
    })

    const totals = data.reduce(
      (acc, item) => ({
        totalUnits: acc.totalUnits + item.quantity,
        totalValue: acc.totalValue + item.value,
      }),
      { totalUnits: 0, totalValue: 0 }
    )

    const pdfBuffer = await generateInventoryReport({
      title: 'Reporte de Inventario',
      generatedAt: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
      tenant: {
        name: tenantRow?.legalName || tenantRow?.name || 'Empresa',
        nit: tenantRow?.nit || '',
      },
      location: locationLabel,
      data,
      totals,
    })

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="inventory-report-${Date.now()}.pdf"`,
      },
    })
  } catch (error) {
    if (error instanceof AppError && error.status < 500) return jsonError(error)
    console.error('[inventory-pdf] Error generando reporte:', error)
    return NextResponse.json({ error: 'No se pudo generar el reporte' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return handleReport(request)
}

export async function POST(request: Request) {
  return handleReport(request)
}
