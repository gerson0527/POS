'use client'

import { useEffect, useState } from 'react'
import { Bot, Copy, ExternalLink, HelpCircle, Save, ShieldOff } from 'lucide-react'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { DataTable } from '@/components/ui/DataTable'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/ToastProvider'
import {
  generateTelegramLinkCode,
  getAssistantConfigForCurrentTenant,
  getAssistantStatus,
  listMyChannelLinks,
  revokeAssistantChannelLink,
  updateTenantAssistantConfig,
} from '@/app/actions/assistant'

interface AssistantSectionProps {
  refreshKey?: number
  onLoadingChange?: (loading: boolean) => void
}

interface LinkRow {
  id: string
  userId: string
  channel: string
  externalUserId: string | null
  status: string
  linkedAt: string | Date | null
  expiresAt: string | Date | null
  createdAt: string | Date
}

const EMPTY_FORM = {
  enabled: false,
  telegramBotToken: '',
  telegramBotUsername: '',
  telegramWebhookSecret: '',
  llmBaseUrl: 'https://opencode.ai/zen/v1',
  llmApiKey: '',
  llmModel: '',
  sttProvider: 'none' as 'none' | 'groq' | 'openai',
  sttApiKey: '',
  sttModel: 'whisper-large-v3',
  sttBaseUrl: '',
  draftTtlMinutes: 10,
  hasTelegramBotToken: false,
  hasLlmApiKey: false,
  hasSttApiKey: false,
  hasWebhookSecret: false,
}

export function AssistantSection({ refreshKey = 0, onLoadingChange }: AssistantSectionProps) {
  const { toast } = useToast()
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getAssistantStatus>> | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [links, setLinks] = useState<LinkRow[]>([])
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [freshCode, setFreshCode] = useState<{
    code: string
    instruction: string
    expiresAt: string
    deepLink: string | null
  } | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)

  async function load() {
    onLoadingChange?.(true)
    try {
      const [st, cfg, rows] = await Promise.all([
        getAssistantStatus(),
        getAssistantConfigForCurrentTenant(),
        listMyChannelLinks(),
      ])
      setStatus(st)
      setForm({ ...EMPTY_FORM, ...cfg })
      setLinks(rows as LinkRow[])
    } catch (err: any) {
      toast(`Error al cargar asistente: ${err.message}`, 'error')
    } finally {
      onLoadingChange?.(false)
    }
  }

  useEffect(() => {
    load()
  }, [refreshKey])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const result = await updateTenantAssistantConfig({
        enabled: form.enabled,
        telegramBotToken: form.telegramBotToken || undefined,
        telegramBotUsername: form.telegramBotUsername,
        telegramWebhookSecret: form.telegramWebhookSecret || undefined,
        llmBaseUrl: form.llmBaseUrl,
        llmApiKey: form.llmApiKey || undefined,
        llmModel: form.llmModel,
        sttProvider: form.sttProvider,
        sttApiKey: form.sttApiKey || undefined,
        sttModel: form.sttModel,
        sttBaseUrl: form.sttBaseUrl,
        draftTtlMinutes: form.draftTtlMinutes,
      })
      if (!result.success) {
        toast(result.message, 'error')
        return
      }
      toast('Configuración del asistente guardada (secretos cifrados en BD).')
      setForm((f) => ({ ...f, telegramBotToken: '', llmApiKey: '', sttApiKey: '', telegramWebhookSecret: '' }))
      await load()
    } catch (err: any) {
      toast(`Error: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    setFreshCode(null)
    try {
      const result = await generateTelegramLinkCode()
      if (!result.success) {
        toast(result.message, 'error')
        return
      }
      const deepLink = result.deepLink ?? null
      setFreshCode({
        code: result.code,
        instruction: result.instruction,
        expiresAt: result.expiresAt,
        deepLink,
      })
      if (deepLink) {
        window.open(deepLink, '_blank', 'noopener,noreferrer')
        toast('Se abrió Telegram. Pulse Iniciar/Start en el bot para vincular.')
      } else {
        toast('Código listo. Agregue el username del bot para abrir Telegram en un clic.')
      }
      await load()
    } catch (err: any) {
      toast(`Error: ${err.message}`, 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function handleRevoke(row: LinkRow) {
    if (!window.confirm(`¿Revocar el vínculo ${row.channel} / ${row.externalUserId || row.id}?`)) {
      return
    }
    try {
      const result = await revokeAssistantChannelLink(row.id)
      if (!result.success) {
        toast(result.message, 'error')
        return
      }
      toast('Vínculo revocado')
      await load()
    } catch (err: any) {
      toast(`Error: ${err.message}`, 'error')
    }
  }

  async function copyInstruction() {
    if (!freshCode) return
    await navigator.clipboard.writeText(freshCode.deepLink || freshCode.instruction)
    toast(freshCode.deepLink ? 'Enlace de Telegram copiado' : 'Instrucción copiada')
  }

  return (
    <div className="space-y-6">
      <div className="border border-line rounded-[6px] bg-surface-2/40">
        <button
          type="button"
          onClick={() => setHelpOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-fg hover:bg-surface-3/50"
        >
          <HelpCircle className="w-4 h-4 text-accent shrink-0" />
          Mensaje de ayuda — qué puede hacer el bot
          <span className="ml-auto text-[10px] text-fg-muted normal-case tracking-normal font-medium">
            {helpOpen ? 'ocultar' : 'ver ejemplos'}
          </span>
        </button>
        {helpOpen && (
          <div className="px-3 pb-3 pt-0 text-[11px] text-fg-muted space-y-3 border-t border-line-dim">
            <p className="pt-2">
              En Telegram: <code className="text-fg">/ayuda</code>. Requiere chat vinculado y, para
              facturar, turno de caja abierto en el POS.
            </p>
            <HelpBlock
              title="Factura (pide cliente si no lo pone)"
              lines={[
                'Facturar Agua Mineral Sin Gas 600ml',
                '→ el bot pide cédula o botón Consumidor final',
                'Factura 1 pan cliente 1234567890',
                'Si la cédula no existe → aviso y CONSUMIDOR FINAL',
              ]}
            />
            <HelpBlock
              title="Varios productos"
              lines={[
                'Factura 2 pan, 1 leche cliente 1234567890',
                'Factura 2 coca y 1 pan cliente 9876543210 en nequi',
              ]}
            />
            <HelpBlock
              title="Varios medios de pago"
              lines={[
                'Factura 1 pan nequi 20000 efectivo resto',
                'Factura 2 pan cliente 123 nequi 15000 efectivo 5000',
              ]}
            />
            <HelpBlock
              title="Inventario y stock"
              lines={[
                'Entrada 10 arroz',
                'Sale 3 leche',
                'Cuánto hay de azúcar',
                'Stock pan',
              ]}
            />
            <p>
              Tras el resumen pulse <strong className="text-fg">Confirmar</strong>. El bot no
              anula facturas ni hace notas crédito por este canal.
            </p>
          </div>
        )}
      </div>

      <SectionPanel
        title="CREDENCIALES DE ESTA EMPRESA"
        subtitle="Cada cliente configura las suyas aquí. Se guardan cifradas en la base de datos (igual que Factus). No van en el .env."
        action={
          <span className="inline-flex items-center gap-1 text-[10px] text-fg-muted uppercase tracking-wider">
            <Bot className="w-3.5 h-3.5" /> por tenant
          </span>
        }
      >
        <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3 mb-4">
          <StatusChip label="Asistente" ok={Boolean(status?.enabled)} detail={status?.enabled ? 'Activo' : 'Inactivo'} />
          <StatusChip
            label="Telegram"
            ok={Boolean(status?.hasTelegram)}
            detail={status?.botUsername ? `@${status.botUsername}` : status?.hasTelegram ? 'Token OK' : 'Sin token'}
          />
          <StatusChip
            label="LLM"
            ok={Boolean(status?.hasLlm)}
            detail={status?.hasLlm ? String(status.llmModel) : 'Sin modelo/API key'}
          />
          <StatusChip
            label="STT (voz)"
            ok={Boolean(status?.hasStt)}
            detail={status?.sttProvider || 'none'}
          />
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            <span className="font-bold uppercase tracking-wider">Activar asistente para esta empresa</span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>TELEGRAM BOT TOKEN *</Label>
              <Input
                type="password"
                autoComplete="off"
                placeholder={form.hasTelegramBotToken ? '•••• (guardado — deje vacío para no cambiar)' : '123456:AA…'}
                value={form.telegramBotToken}
                onChange={(e) => setForm({ ...form, telegramBotToken: e.target.value })}
              />
            </div>
            <div>
              <Label>TELEGRAM BOT USERNAME</Label>
              <Input
                placeholder="MiBotPOS (sin @)"
                value={form.telegramBotUsername}
                onChange={(e) => setForm({ ...form, telegramBotUsername: e.target.value })}
              />
            </div>
            <div>
              <Label>WEBHOOK SECRET (opcional, prod)</Label>
              <Input
                type="password"
                autoComplete="off"
                placeholder={form.hasWebhookSecret ? '•••• (guardado)' : 'secreto largo'}
                value={form.telegramWebhookSecret}
                onChange={(e) => setForm({ ...form, telegramWebhookSecret: e.target.value })}
              />
            </div>
            <div>
              <Label>TTL BORRADOR (minutos)</Label>
              <Input
                type="number"
                min={1}
                value={form.draftTtlMinutes}
                onChange={(e) => setForm({ ...form, draftTtlMinutes: Number(e.target.value) || 10 })}
              />
            </div>
          </div>

          <div className="border-t border-line-dim pt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>LLM BASE URL (OpenAI-compatible / OpenCode Zen)</Label>
              <Input
                value={form.llmBaseUrl}
                onChange={(e) => setForm({ ...form, llmBaseUrl: e.target.value })}
              />
            </div>
            <div>
              <Label>LLM API KEY *</Label>
              <Input
                type="password"
                autoComplete="off"
                placeholder={form.hasLlmApiKey ? '•••• (guardado — deje vacío para no cambiar)' : 'sk-…'}
                value={form.llmApiKey}
                onChange={(e) => setForm({ ...form, llmApiKey: e.target.value })}
              />
            </div>
            <div>
              <Label>LLM MODEL (vacío = aleatorio free)</Label>
              <Input
                placeholder="auto  |  deepseek-v4.1-flash-free  |  beam-free"
                value={form.llmModel}
                onChange={(e) => setForm({ ...form, llmModel: e.target.value })}
              />
              <p className="mt-1 text-[10px] text-fg-muted">
                Deje vacío o escriba <code>auto</code> / <code>free</code> para elegir al azar entre
                los modelos gratis de OpenCode. La API key sigue siendo obligatoria.
              </p>
            </div>
          </div>

          <div className="border-t border-line-dim pt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label>STT PROVEEDOR (voz)</Label>
              <Select
                value={form.sttProvider}
                onChange={(e) =>
                  setForm({ ...form, sttProvider: e.target.value as 'none' | 'groq' | 'openai' })
                }
              >
                <option value="none">Ninguno</option>
                <option value="groq">Groq Whisper</option>
                <option value="openai">OpenAI Whisper</option>
              </Select>
            </div>
            <div>
              <Label>STT API KEY</Label>
              <Input
                type="password"
                autoComplete="off"
                placeholder={form.hasSttApiKey ? '•••• (guardado)' : 'opcional'}
                value={form.sttApiKey}
                onChange={(e) => setForm({ ...form, sttApiKey: e.target.value })}
              />
            </div>
            <div>
              <Label>STT MODEL</Label>
              <Input
                value={form.sttModel}
                onChange={(e) => setForm({ ...form, sttModel: e.target.value })}
              />
            </div>
            <div>
              <Label>STT BASE URL</Label>
              <Input
                placeholder="vacío = default del proveedor"
                value={form.sttBaseUrl}
                onChange={(e) => setForm({ ...form, sttBaseUrl: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <TacticalButton type="submit" variant="primary" size="sm" loading={saving} icon={<Save className="w-3.5 h-3.5" />}>
              GUARDAR CREDENCIALES
            </TacticalButton>
          </div>
        </form>
      </SectionPanel>

      <SectionPanel
        title="VINCULAR MI USUARIO"
        subtitle="Tras guardar el bot, genere el enlace: se abre Telegram y al pulsar Iniciar queda vinculado."
      >
        <p className="text-[11px] text-fg-muted leading-relaxed mb-3">
          Para facturar necesita turno de caja abierto. Inventario: roles ADMIN/MANAGER.
        </p>
        <TacticalButton
          type="button"
          variant="primary"
          size="sm"
          loading={generating}
          onClick={handleGenerate}
          icon={<ExternalLink className="w-3.5 h-3.5" />}
          disabled={!status?.enabled || !status?.hasTelegram}
        >
          VINCULAR CON TELEGRAM
        </TacticalButton>

        {freshCode && (
          <div className="mt-4 rounded border border-accent/40 bg-accent/5 p-3 text-xs">
            <div className="font-mono text-lg font-bold tracking-widest text-accent">{freshCode.code}</div>
            <div className="mt-1 text-fg-muted">{freshCode.instruction}</div>
            <div className="mt-1 text-[10px] text-fg-muted">
              Expira: {new Date(freshCode.expiresAt).toLocaleString('es-CO')}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {freshCode.deepLink && (
                <TacticalButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => window.open(freshCode.deepLink!, '_blank', 'noopener,noreferrer')}
                  icon={<ExternalLink className="w-3.5 h-3.5" />}
                >
                  ABRIR TELEGRAM
                </TacticalButton>
              )}
              <TacticalButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={copyInstruction}
                icon={<Copy className="w-3.5 h-3.5" />}
              >
                COPIAR ENLACE
              </TacticalButton>
            </div>
          </div>
        )}
      </SectionPanel>

      <SectionPanel title="VÍNCULOS DEL TENANT" subtitle="Chats autorizados a hablar con el bot.">
        <DataTable
          rows={links}
          rowKey={(row) => row.id}
          emptyMessage="[SIN VÍNCULOS]"
          columns={[
            {
              key: 'channel',
              header: 'CANAL',
              render: (row) => row.channel.toUpperCase(),
            },
            {
              key: 'external',
              header: 'ID EXTERNO',
              render: (row) => (
                <span className="font-mono text-[11px]">{row.externalUserId || '—'}</span>
              ),
            },
            {
              key: 'status',
              header: 'ESTADO',
              render: (row) => (
                <StatusBadge
                  status={
                    row.status === 'ACTIVE'
                      ? 'online'
                      : row.status === 'PENDING'
                        ? 'pending'
                        : 'default'
                  }
                  label={row.status}
                />
              ),
            },
            {
              key: 'user',
              header: 'USER ID',
              render: (row) => (
                <span className="font-mono text-[10px] text-fg-muted">{row.userId}</span>
              ),
            },
            {
              key: 'actions',
              header: 'ACCIONES',
              align: 'right',
              render: (row) =>
                row.status !== 'REVOKED' ? (
                  <TacticalButton
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => handleRevoke(row)}
                  >
                    <ShieldOff className="w-3 h-3 mr-1" /> REVOCAR
                  </TacticalButton>
                ) : (
                  <span className="text-fg-muted text-xs">—</span>
                ),
            },
          ]}
        />
      </SectionPanel>
    </div>
  )
}

function StatusChip({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="rounded border border-line-dim bg-panel/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-fg-muted">{label}</div>
      <div className={`mt-1 font-bold ${ok ? 'text-success-fg' : 'text-warn-fg'}`}>
        {ok ? 'OK' : 'PENDIENTE'}
      </div>
      <div className="mt-0.5 truncate text-[10px] text-fg-muted" title={detail}>
        {detail}
      </div>
    </div>
  )
}

function HelpBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-fg mb-1">{title}</div>
      <ul className="space-y-0.5 font-mono text-[11px] text-fg">
        {lines.map((line) => (
          <li key={line} className={line.startsWith('→') || line.startsWith('Si ') ? 'text-fg-muted font-sans' : ''}>
            {line.startsWith('→') || line.startsWith('Si ') ? line : `• ${line}`}
          </li>
        ))}
      </ul>
    </div>
  )
}
