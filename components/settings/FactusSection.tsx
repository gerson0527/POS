'use client'

import { useState, useEffect } from 'react'
import {
  Save,
  Zap,
  RefreshCcw,
  ShieldCheck,
  Server,
  Cloud,
  CheckCircle2,
} from 'lucide-react'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { useToast } from '@/components/ui/ToastProvider'
import { DataTable } from '@/components/ui/DataTable'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import {
  testFactusConnection,
  fetchFactusNumberingRanges,
  getInvoiceProviderStatus,
  getFactusConfigForCurrentTenant,
  updateTenantFactusConfig,
} from '@/app/actions/pos-actions'

const EMPTY_FACTUS_CONFIG = {
  factusClientId: '',
  factusClientSecret: '',
  factusUsername: '',
  factusPassword: '',
  factusEnvironment: 'sandbox' as 'sandbox' | 'production',
  factusNumberingRangeId: 0,
  hasClientSecret: false,
  hasPassword: false,
}

interface FactusSectionProps {
  refreshKey?: number
  onLoadingChange?: (loading: boolean) => void
}

export function FactusSection({ refreshKey = 0, onLoadingChange }: FactusSectionProps) {
  const { toast } = useToast()

  const [saving, setSaving] = useState(false)
  const [factusConfig, setFactusConfig] = useState(EMPTY_FACTUS_CONFIG)
  const [factusStatus, setFactusStatus] = useState<{ configured: boolean; providerId: string | null; environment: string | null }>({
    configured: false,
    providerId: null,
    environment: null,
  })
  const [factusTestResult, setFactusTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [factusRanges, setFactusRanges] = useState<Array<{ id: number; prefix: string; from: number; to: number; current: number; status: string }>>([])
  const [factusLoading, setFactusLoading] = useState(false)

  async function loadFactusConfigData() {
    try {
      const [status, cfg] = await Promise.all([
        getInvoiceProviderStatus(),
        getFactusConfigForCurrentTenant(),
      ])
      setFactusStatus(status)
      setFactusConfig(cfg)
    } catch (err) {
      console.error('Error cargando Factus config:', err)
    }
  }

  useEffect(() => {
    let cancelled = false
    onLoadingChange?.(true)
    ;(async () => {
      try {
        const [status, cfg] = await Promise.all([
          getInvoiceProviderStatus(),
          getFactusConfigForCurrentTenant(),
        ])
        if (!cancelled) {
          setFactusStatus(status)
          setFactusConfig(cfg)
        }
      } catch (err) {
        console.error('Error cargando Factus config:', err)
      } finally {
        if (!cancelled) onLoadingChange?.(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  async function handleSaveFactusConfig(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      // Los secretos (client_secret / password) nunca se envían de vuelta al servidor
      // salvo que el usuario escriba uno nuevo. Cadena vacía = "no cambiar".
      const payload = {
        factusClientId: factusConfig.factusClientId,
        factusClientSecret: factusConfig.factusClientSecret,
        factusUsername: factusConfig.factusUsername,
        factusPassword: factusConfig.factusPassword,
        factusEnvironment: factusConfig.factusEnvironment,
        factusNumberingRangeId: Number(factusConfig.factusNumberingRangeId) || 0,
      }
      console.log('[DEBUG] Enviando payload a updateTenantFactusConfig:', {
        ...payload,
        factusClientSecret: payload.factusClientSecret ? '***' : '(sin cambio)',
        factusPassword: payload.factusPassword ? '***' : '(sin cambio)',
      })
      const result = await updateTenantFactusConfig(payload)
      console.log('[DEBUG] Resultado de updateTenantFactusConfig:', result)
      toast('Configuración de facturación electrónica guardada')
      await loadFactusConfigData()
    } catch (err: any) {
      console.error('[DEBUG] Error al guardar Factus config:', err)
      toast(`Error al guardar: ${err?.message ?? err}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestFactus() {
    setFactusLoading(true)
    setFactusTestResult(null)
    try {
      const res = await testFactusConnection()
      setFactusTestResult(res)
    } catch (err: any) {
      setFactusTestResult({ ok: false, message: err.message })
    } finally {
      setFactusLoading(false)
    }
  }

  async function handleFetchFactusRanges() {
    setFactusLoading(true)
    try {
      const ranges = await fetchFactusNumberingRanges()
      setFactusRanges(ranges)
      toast(`${ranges.length} rango(s) encontrado(s) en el proveedor`)
    } catch (err: any) {
      toast(`Error: ${err.message}`, 'error')
    } finally {
      setFactusLoading(false)
    }
  }

  return (
    <SectionPanel
      title="FACTURACIÓN ELECTRÓNICA — PROVEEDOR TERCERO"
      subtitle="CONFIGURACIÓN GENÉRICA DE PROVEEDOR (SANDBOX/PRODUCCIÓN)"
      statusSlot={
        factusStatus.configured ? (
          <StatusBadge status="online" label={`${factusStatus.environment?.toUpperCase()} ✓`} />
        ) : (
          <StatusBadge status="critical" label="SIN CONFIGURAR" />
        )
      }
    >
      <div className="space-y-5 font-mono text-xs max-w-4xl">
        <div className="bg-surface border border-accent/30 rounded p-4 flex items-start gap-3">
          <Cloud className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div>
            <div className="text-fg font-bold uppercase tracking-wider text-[10px] mb-1">
              ¿Cómo funciona la facturación electrónica?
            </div>
            <div className="text-fg-muted text-[11px] leading-relaxed">
              Al cobrar una venta, el sistema toma los datos del POS (cliente, productos, totales, pagos) y
              los envía al proveedor configurado, quien los transmite a la DIAN y devuelve el
              <strong className="text-success"> CUFE</strong>, el PDF firmado y el XML. Estos datos se guardan
              en este POS. Puedes cambiar de proveedor configurando otro diferente en este mismo formulario.
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveFactusConfig} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <Label>AMBIENTE DEL PROVEEDOR</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFactusConfig({ ...factusConfig, factusEnvironment: 'sandbox' })}
                  className={`p-3 rounded border text-left flex items-center gap-3 transition-all ${
                    factusConfig.factusEnvironment === 'sandbox'
                      ? 'bg-accent/10 border-accent text-fg'
                      : 'bg-surface border-line text-fg-muted'
                  }`}
                >
                  <Server className="w-4 h-4 text-accent" />
                  <div>
                    <div className="font-bold uppercase text-xs">SANDBOX (Pruebas)</div>
                    <div className="text-[10px] opacity-80">api-sandbox.factus.com.co — Ideal para desarrollo</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setFactusConfig({ ...factusConfig, factusEnvironment: 'production' })}
                  className={`p-3 rounded border text-left flex items-center gap-3 transition-all ${
                    factusConfig.factusEnvironment === 'production'
                      ? 'bg-success-solid/10 border-success-solid text-fg'
                      : 'bg-surface border-line text-fg-muted'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4 text-success-solid" />
                  <div>
                    <div className="font-bold uppercase text-xs">PRODUCCIÓN</div>
                    <div className="text-[10px] opacity-80">api.factus.com.co — Ambiente oficial DIAN</div>
                  </div>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>CLIENT ID (Proveedor)</Label>
              <Input
                type="text"
                placeholder="Client ID entregado por el proveedor"
                value={factusConfig.factusClientId}
                onChange={(e) => setFactusConfig({ ...factusConfig, factusClientId: e.target.value })}
                className="bg-surface text-fg px-4 py-2.5 font-mono text-xs outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label>CLIENT SECRET (Proveedor)</Label>
              <Input
                type="password"
                placeholder={factusConfig.hasClientSecret ? '•••••• (guardado — deja vacío para mantener)' : 'Client Secret del proveedor'}
                value={factusConfig.factusClientSecret}
                onChange={(e) => setFactusConfig({ ...factusConfig, factusClientSecret: e.target.value })}
                autoComplete="off"
                className="bg-surface text-fg px-4 py-2.5 font-mono text-xs outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label>USUARIO / EMAIL (Password Grant)</Label>
              <Input
                type="email"
                placeholder="tu-correo@proveedor.com"
                value={factusConfig.factusUsername}
                onChange={(e) => setFactusConfig({ ...factusConfig, factusUsername: e.target.value })}
                className="bg-surface text-fg px-4 py-2.5 font-mono text-xs outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label>CONTRASEÑA (Password Grant)</Label>
              <Input
                type="password"
                placeholder={factusConfig.hasPassword ? '•••••• (guardado — deja vacío para mantener)' : 'Contraseña del proveedor'}
                value={factusConfig.factusPassword}
                onChange={(e) => setFactusConfig({ ...factusConfig, factusPassword: e.target.value })}
                autoComplete="off"
                className="bg-surface text-fg px-4 py-2.5 font-mono text-xs outline-none"
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>ID RANGO DE NUMERACIÓN</Label>
                <button
                  type="button"
                  onClick={handleFetchFactusRanges}
                  disabled={factusLoading}
                  className="flex items-center gap-1 text-[10px] text-accent hover:text-accent-hover font-bold uppercase disabled:opacity-50"
                >
                  <RefreshCcw className={`w-3 h-3 ${factusLoading ? 'animate-spin' : ''}`} />
                  Listar rangos del proveedor
                </button>
              </div>
              <Input
                type="number"
                min="0"
                placeholder={factusRanges.length === 0 ? 'Ej: 389' : 'ID numérico del rango'}
                value={factusConfig.factusNumberingRangeId || ''}
                onChange={(e) => setFactusConfig({ ...factusConfig, factusNumberingRangeId: parseInt(e.target.value) || 0 })}
                className="bg-surface text-fg px-4 py-2.5 font-mono text-xs outline-none"
              />
              {factusRanges.length > 0 && (
                <DataTable
                  columns={[
                    {
                      key: 'id',
                      header: 'ID',
                      thClassName: 'px-2! py-1.5!',
                      cellClassName: 'px-2! py-1.5! text-accent font-bold',
                      render: (r) => (
                        <button
                          type="button"
                          onClick={() =>
                            setFactusConfig({ ...factusConfig, factusNumberingRangeId: r.id })
                          }
                        >
                          {r.id}
                        </button>
                      ),
                    },
                    {
                      key: 'prefix',
                      header: 'Prefijo',
                      thClassName: 'px-2! py-1.5!',
                      cellClassName: 'px-2! py-1.5! text-fg font-mono',
                      render: (r) => r.prefix,
                    },
                    {
                      key: 'rango',
                      header: 'Rango',
                      thClassName: 'px-2! py-1.5!',
                      cellClassName: 'px-2! py-1.5! text-fg-muted',
                      render: (r) => `${r.from} - ${r.to}`,
                    },
                    {
                      key: 'status',
                      header: 'Estado',
                      thClassName: 'px-2! py-1.5!',
                      cellClassName: 'px-2! py-1.5! text-fg-muted',
                      render: (r) => r.status,
                    },
                  ]}
                  rows={factusRanges}
                  rowKey={(r) => r.id}
                  rowClassName={(r) =>
                    `hover:bg-ash ${factusConfig.factusNumberingRangeId === r.id ? 'bg-accent/10' : ''}`
                  }
                  wrapperClassName="max-h-40 overflow-y-auto border border-line rounded mt-2"
                  tableClassName="w-full text-[10px]"
                  theadClassName="bg-panel text-fg-muted sticky top-0"
                  tbodyClassName="divide-y divide-line-soft"
                />
              )}
            </div>
          </div>

          {factusTestResult && (
            <div
              className={`p-3 rounded text-[11px] font-bold ${
                factusTestResult.ok
                  ? 'bg-ok-dim border border-ok-line text-success'
                  : 'bg-alert-dim border border-alert-line text-danger'
              }`}
            >
              {factusTestResult.ok ? '✓ ' : '⚠ '}
              {factusTestResult.message}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line-soft">
            <TacticalButton
              type="submit"
              variant="primary"
              size="sm"
              loading={saving}
              icon={<Save className="w-3.5 h-3.5" />}
            >
              GUARDAR CONFIGURACIÓN
            </TacticalButton>
            <TacticalButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleTestFactus}
              loading={factusLoading}
              icon={<Zap className="w-3.5 h-3.5" />}
            >
              PROBAR CONEXIÓN
            </TacticalButton>
            {factusStatus.configured && (
              <span className="ml-auto text-[10px] text-ok font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                PROVEEDOR ACTIVO: {factusStatus.providerId?.toUpperCase()} ({factusStatus.environment})
              </span>
            )}
          </div>
        </form>
      </div>
    </SectionPanel>
  )
}
