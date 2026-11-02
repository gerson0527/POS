import { NextRequest, NextResponse } from 'next/server'
import { handleIncomingMessage } from '@/lib/assistant/conversation'
import {
  findTenantByWhatsappPhoneNumberId,
  findTenantByWhatsappVerifyToken,
  getTenantAssistantRuntime,
} from '@/lib/assistant/tenant-config'
import {
  createWhatsAppAdapter,
  extractWhatsappPhoneNumberId,
  getWhatsAppConfigFromEnv,
  verifyWhatsappHubToken,
} from '@/lib/channels/whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * WhatsApp Cloud API por empresa (mismo patrón que Telegram).
 * Identifica el tenant con:
 *   - ?tenantId=... (recomendado al registrar el webhook en Meta)
 *   - phone_number_id del payload
 *   - hub.verify_token en el handshake GET
 * Fallback opcional: WHATSAPP_* en .env (dev / single-tenant).
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')
  const tenantIdParam = params.get('tenantId')

  if (mode !== 'subscribe' || !token || !challenge) {
    return NextResponse.json({
      ok: false,
      hint: 'Registre en Meta: GET/POST /api/channels/whatsapp?tenantId=SU_TENANT_ID',
    })
  }

  if (tenantIdParam) {
    const runtime = await getTenantAssistantRuntime(tenantIdParam)
    if (
      runtime?.enabled &&
      runtime.whatsapp &&
      verifyWhatsappHubToken(token, runtime.whatsapp.verifyToken)
    ) {
      return new NextResponse(challenge, { status: 200 })
    }
  }

  const byVerify = await findTenantByWhatsappVerifyToken(token)
  if (byVerify) {
    return new NextResponse(challenge, { status: 200 })
  }

  const envWa = getWhatsAppConfigFromEnv()
  if (envWa && verifyWhatsappHubToken(token, envWa.verifyToken)) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ ok: false }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const tenantIdParam = req.nextUrl.searchParams.get('tenantId')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const phoneNumberId = extractWhatsappPhoneNumberId(body)

  let tenantId: string | null = tenantIdParam
  let runtime = tenantId ? await getTenantAssistantRuntime(tenantId) : null

  if ((!runtime?.enabled || !runtime.whatsapp) && phoneNumberId) {
    const found = await findTenantByWhatsappPhoneNumberId(phoneNumberId)
    if (found) {
      tenantId = found.tenantId
      runtime = found.runtime
    }
  }

  // Fallback .env solo si no hay config por tenant
  if ((!runtime?.enabled || !runtime.whatsapp) && tenantIdParam) {
    const envWa = getWhatsAppConfigFromEnv()
    if (envWa) {
      const envRuntime = await getTenantAssistantRuntime(tenantIdParam)
      if (envRuntime?.enabled) {
        tenantId = tenantIdParam
        runtime = { ...envRuntime, whatsapp: envWa }
      }
    }
  }

  if (!tenantId || !runtime?.enabled || !runtime.whatsapp) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Asistente WhatsApp no configurado. Guarde Access Token + Phone Number ID + Verify Token en el panel, o pase ?tenantId=',
      },
      { status: 503 }
    )
  }

  const adapter = createWhatsAppAdapter(runtime.whatsapp)
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
