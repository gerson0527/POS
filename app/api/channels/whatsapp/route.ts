import { NextRequest, NextResponse } from 'next/server'
import { handleIncomingMessage } from '@/lib/assistant/conversation'
import { getTenantAssistantRuntime } from '@/lib/assistant/tenant-config'
import {
  createWhatsAppAdapter,
  getWhatsAppConfigFromEnv,
} from '@/lib/channels/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * WhatsApp Cloud API — fase inicial: un bot de plataforma (env) o
 * ?tenantId= para asociar el runtime LLM del tenant.
 * (Tokens WhatsApp por tenant se pueden añadir igual que Telegram.)
 */
export async function GET(req: NextRequest) {
  const wa = getWhatsAppConfigFromEnv()
  if (!wa) {
    return NextResponse.json(
      { ok: false, error: 'WhatsApp no configurado (WHATSAPP_* en servidor o próximamente por tenant).' },
      { status: 503 }
    )
  }
  const params = req.nextUrl.searchParams
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')
  if (mode === 'subscribe' && token === wa.verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ ok: false }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const wa = getWhatsAppConfigFromEnv()
  const tenantId = req.nextUrl.searchParams.get('tenantId')
  if (!wa || !tenantId) {
    return NextResponse.json(
      { ok: false, error: 'Requiere WHATSAPP_* y ?tenantId=' },
      { status: 503 }
    )
  }

  const runtime = await getTenantAssistantRuntime(tenantId)
  if (!runtime?.enabled) {
    return NextResponse.json({ ok: false }, { status: 503 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const adapter = createWhatsAppAdapter(wa)
  const msg = adapter.parseIncoming(body)
  if (!msg) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  try {
    await handleIncomingMessage(adapter, msg, { botTenantId: tenantId, runtime })
  } catch (err) {
    console.error('[whatsapp webhook]', err)
  }

  return NextResponse.json({ ok: true })
}
