/**
 * Long polling de Telegram para desarrollo (todos los tenants con bot activo,
 * o uno solo con ASSISTANT_POLL_TENANT_ID).
 *
 *   npm run assistant:poll
 *
 * Las credenciales salen de la BD del tenant (panel Configuración → Asistente),
 * no del .env (salvo DATABASE_URL / ENCRYPTION_KEY).
 */
import {
  getTenantAssistantRuntime,
  listTenantsWithTelegramBot,
} from '../lib/assistant/tenant-config'
import { handleIncomingMessage } from '../lib/assistant/conversation'
import { createTelegramAdapter } from '../lib/channels/telegram'

async function pollTenant(tenantId: string) {
  const runtime = await getTenantAssistantRuntime(tenantId)
  if (!runtime?.enabled || !runtime.telegram) {
    console.error(`[poll] Tenant ${tenantId}: asistente sin Telegram activo.`)
    return
  }

  const adapter = createTelegramAdapter(runtime.telegram)
  const api = `https://api.telegram.org/bot${runtime.telegram.botToken}`
  let offset = 0

  await fetch(`${api}/deleteWebhook`, { method: 'POST' })
  console.log(`[poll] Escuchando tenant ${tenantId}…`)

  for (;;) {
    try {
      const res = await fetch(`${api}/getUpdates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offset,
          timeout: 25,
          allowed_updates: ['message', 'callback_query'],
        }),
        signal: AbortSignal.timeout(35_000),
      })
      if (!res.ok) {
        console.error(`[poll:${tenantId}] getUpdates`, res.status, await res.text())
        await sleep(2000)
        continue
      }
      const json = (await res.json()) as {
        ok: boolean
        result?: Array<{ update_id: number } & Record<string, unknown>>
      }
      for (const update of json.result ?? []) {
        offset = update.update_id + 1
        const msg = adapter.parseIncoming(update)
        if (!msg) continue
        console.log(
          `[poll:${tenantId}] ${msg.type} from ${msg.externalUserId}: ${(msg.text || msg.callbackData || '').slice(0, 80)}`
        )
        try {
          await handleIncomingMessage(adapter, msg, { botTenantId: tenantId, runtime })
        } catch (err) {
          console.error(`[poll:${tenantId}] handle error`, err)
        }
      }
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') continue
      console.error(`[poll:${tenantId}] loop error`, err?.message ?? err)
      await sleep(2000)
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const only = process.env.ASSISTANT_POLL_TENANT_ID?.trim()
  if (only) {
    await pollTenant(only)
    return
  }

  const tenants = await listTenantsWithTelegramBot()
  if (!tenants.length) {
    console.error(
      'Ningún tenant tiene asistente activo con token de Telegram.\n' +
        'Configure en el panel: Configuración → Asistente Telegram.\n' +
        'O use ASSISTANT_POLL_TENANT_ID=<id>.'
    )
    process.exit(1)
  }

  console.log(`[poll] ${tenants.length} bot(s) activo(s).`)
  await Promise.all(tenants.map((t) => pollTenant(t.tenantId)))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
