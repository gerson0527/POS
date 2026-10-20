import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await db.execute(sql`select 1`)
    return Response.json(
      { status: 'ok', database: 'ok', uptime: Math.round(process.uptime()) },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return Response.json(
      { status: 'error', database: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
