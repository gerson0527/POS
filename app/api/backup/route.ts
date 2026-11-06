import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireActor } from '@/app/actions/_shared'
import { logAudit } from '@/lib/audit/log'
import { jsonError, parseJsonBody } from '@/lib/api/http'
import { resolveBackupTables } from '@/lib/backup/catalog'
import { exportBackupSql } from '@/lib/backup/export'
import { backupFileName, parseMonthRange } from '@/lib/backup/sql'

export const maxDuration = 60

const bodySchema = z.object({
  scope: z.enum(['all', 'tables']),
  tables: z.array(z.string()).optional(),
  fromMonth: z.string().optional(),
  toMonth: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const actor = await requireActor(['ADMIN', 'MANAGER'])
    const body = await parseJsonBody(request, bodySchema)
    const tables = resolveBackupTables(body.scope, body.tables || [])
    const range = parseMonthRange(body.fromMonth, body.toMonth)
    const filename = backupFileName(range)

    await logAudit(actor.tenantId, actor.userId, 'CREATE', 'database_backup', actor.tenantId, {
      scope: body.scope,
      tables: tables.map((table) => table.name),
      fromMonth: range?.from ?? null,
      toMonth: range?.to ?? null,
      filename,
    })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of exportBackupSql({
            tenantId: actor.tenantId,
            tables,
            range,
          })) {
            controller.enqueue(encoder.encode(chunk))
          }
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/sql; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof Error && /Seleccione|tabla|mes/i.test(error.message)) {
      return NextResponse.json({ message: error.message }, { status: 400 })
    }
    return jsonError(error)
  }
}
