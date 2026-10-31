import { NextRequest, NextResponse } from 'next/server'
import { handleIncomingMessage } from '@/lib/assistant/conversation'
import {
  findTenantByTelegramWebhookSecret,
  getTenantAssistantRuntime,
} from '@/lib/assistant/tenant-config'
import { createTelegramAdapter, verifyTelegramSecret } from '@/lib/channels/telegram'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Webhook de Telegram por empresa.
 * Identifica el tenant con:
 *   - ?tenantId=...  (recomendado al registrar setWebhook)
 *   - o header X-Telegram-Bot-Api-Secret-Token (único por empresa)
 */
export async function POST(req: NextRequest) {
  const tenantIdParam = req.nextUrl.searchParams.get('tenantId')
  const secretHeader = req.headers.get('x-telegram-bot-api-secret-token')

  let tenantId: string | null = tenantIdParam
  let runtime = tenantId ? await getTenantAssistantRuntime(tenantId) : null

  if ((!runtime || !runtime.enabled || !runtime.telegram) && secretHeader) {
    const found = await findTenantByTelegramWebhookSecret(secretHeader)
    if (found) {
      tenantId = found.tenantId
      runtime = found.runtime
    }
  }

  if (!tenantId || !runtime?.enabled || !runtime.telegram) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Asistente no configurado para este webhook. Configure el bot en el panel o pase ?tenantId=',
      },
      { status: 503 }
    )
  }

  if (!verifyTelegramSecret(secretHeader, runtime.telegram.webhookSecret)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const adapter = createTelegramAdapter(runtime.telegram)
  const msg = adapter.parseIncoming(body)
  if (!msg) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  try {
    await handleIncomingMessage(adapter, msg, { botTenantId: tenantId, runtime })
  } catch (err) {
    console.error('[telegram webhook]', err)
  }

  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId')
  if (!tenantId) {
    return NextResponse.json({
      ok: false,
      hint: 'POST /api/channels/telegram?tenantId=SU_TENANT_ID con el update de Telegram.',
    })
  }
  const runtime = await getTenantAssistantRuntime(tenantId)
  return NextResponse.json({
    ok: Boolean(runtime?.enabled && runtime.telegram),
    enabled: runtime?.enabled ?? false,
    hasTelegram: Boolean(runtime?.telegram),
    hasLlm: Boolean(runtime?.llm),
  })
}
