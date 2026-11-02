'use client'

import { useState, useEffect } from 'react'
import { CalendarClock, Save } from 'lucide-react'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useToast } from '@/components/ui/ToastProvider'
import { getCompanyInfo, updateCompanyInfo } from '@/app/actions/pos-actions'
import {
  CREDIT_TERM_DAYS_MAX,
  CREDIT_TERM_DAYS_MIN,
  DEFAULT_CREDIT_TERM_DAYS,
  normalizeCreditTermDays,
} from '@/lib/credit/terms'

const CREDIT_TERM_DAY_OPTIONS = Array.from(
  { length: CREDIT_TERM_DAYS_MAX - CREDIT_TERM_DAYS_MIN + 1 },
  (_, index) => CREDIT_TERM_DAYS_MIN + index
)

const DEFAULT_FORM = {
  name: '',
  legalName: '',
  nit: '',
  email: '',
  phone: '',
  address: '',
  dianSoftwareId: '',
  dianSoftwarePin: '',
  dianUsername: '',
  dianPassword: '',
  dianTestSetId: '',
  dianEnvironment: '2', // 1: Production, 2: Habilitación/Pruebas
  creditTermDays: DEFAULT_CREDIT_TERM_DAYS,
}

interface CompanySectionProps {
  refreshKey?: number
  onLoadingChange?: (loading: boolean) => void
}

export function CompanySection({ refreshKey = 0, onLoadingChange }: CompanySectionProps) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)

  useEffect(() => {
    let cancelled = false
    onLoadingChange?.(true)
    ;(async () => {
      try {
        const data = await getCompanyInfo()
        if (data && !cancelled) {
          setForm({
            name: data.name || '',
            legalName: data.legalName || data.name || '',
            nit: data.nit || '',
            email: data.email || '',
            phone: data.phone || '',
            address: data.address || '',
            dianSoftwareId: data.dianSoftwareId || '',
            dianSoftwarePin: data.dianSoftwarePin || '',
            dianUsername: data.dianUsername || '',
            dianPassword: data.dianPassword || '',
            dianTestSetId: data.dianTestSetId || '',
            dianEnvironment: data.dianEnvironment || '2',
            creditTermDays: normalizeCreditTermDays(
              data.creditTermDays ?? DEFAULT_CREDIT_TERM_DAYS
            ),
          })
        }
      } catch (err) {
        console.error('Error al cargar información de la empresa:', err)
      } finally {
        if (!cancelled) onLoadingChange?.(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const creditTermDays = normalizeCreditTermDays(form.creditTermDays)

  async function handleSaveCompanyInfo(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await updateCompanyInfo({
        name: form.name,
        legalName: form.legalName || form.name,
        nit: form.nit,
        email: form.email,
        phone: form.phone,
        address: form.address,
        dianSoftwareId: form.dianSoftwareId,
        dianSoftwarePin: form.dianSoftwarePin,
        dianUsername: form.dianUsername,
        dianPassword: form.dianPassword,
        dianTestSetId: form.dianTestSetId,
        dianEnvironment: form.dianEnvironment,
        creditTermDays,
      })
      toast('¡CONFIGURACIÓN DE EMPRESA Y PARAMETROS GUARDADOS CORRECTAMENTE!')
    } catch (err: any) {
      toast(`Error al guardar configuración: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSaveCompanyInfo} className="space-y-6">
      <SectionPanel
        title="INFORMACIÓN CORPORATIVA Y NIT"
        subtitle="DATOS EDITABLES REGISTRADOS ANTE LA DIAN COLOMBIA"
        statusSlot={<StatusBadge status="online" label="EDITABLE OK" />}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
          <div className="space-y-1.5">
            <Label>RAZÓN SOCIAL / NOMBRE DE EMPRESA *</Label>
            <Input
              type="text"
              required
              placeholder="Ej: Comercializadora Mi Empresa S.A.S."
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-surface text-fg px-4 py-2.5 font-mono text-xs outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>NÚMERO DE IDENTIFICACIÓN TRIBUTARIA (NIT) *</Label>
            <Input
              type="text"
              required
              placeholder="Ej: 901.234.567-8"
              value={form.nit}
              onChange={(e) => setForm({ ...form, nit: e.target.value })}
              className="bg-surface text-fg px-4 py-2.5 font-mono text-xs outline-none font-bold"
            />
          </div>

          <div className="space-y-1.5">
            <Label>CORREO ELECTRÓNICO FISCAL (NOTIFICACIONES DIAN)</Label>
            <Input
              type="email"
              placeholder="facturacion@miempresa.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="bg-surface text-fg px-4 py-2.5 font-mono text-xs outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>TELÉFONO DE CONTACTO PRINCIPAL</Label>
            <Input
              type="text"
              placeholder="Ej: +57 601 555 0199 / 300 123 4567"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="bg-surface text-fg px-4 py-2.5 font-mono text-xs outline-none"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>DIRECCIÓN FÍSICA Y CIUDAD DE OPERACIÓN</Label>
            <Input
              type="text"
              placeholder="Ej: Carrera 7 # 71-21, Bogotá D.C., Colombia"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="bg-surface text-fg px-4 py-2.5 font-mono text-xs outline-none"
            />
          </div>
        </div>
      </SectionPanel>

      <SectionPanel
        title="CRÉDITO A CLIENTES // DÍA DE PAGO Y MORA"
        subtitle="Elija el día del mes en que el cliente paga; el crédito vence ese día del mes siguiente"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[11px] text-fg-muted leading-relaxed max-w-3xl">
            Cuando vende a crédito (cuenta corriente), cada factura/cargo vence el día configurado
            del <strong className="text-fg">mes siguiente</strong> a la venta. Mientras no venza, el
            cliente aparece <strong className="text-fg">AL DÍA</strong> aunque deba plata. Si pasa
            esa fecha sin pagar, el cargo queda <strong className="text-fg">VENCIDO</strong> y el
            cliente en <strong className="text-fg">MORA</strong>. El cliente puede abonar el mismo
            día o cualquier día; no necesita estar en mora para pagar.
          </p>

          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-3 rounded border border-line-dim bg-panel/40 p-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="w-28 space-y-1.5">
                  <Label>DÍA DE PAGO DEL MES *</Label>
                  <Input
                    type="number"
                    required
                    min={CREDIT_TERM_DAYS_MIN}
                    max={CREDIT_TERM_DAYS_MAX}
                    value={Number.isFinite(form.creditTermDays) ? form.creditTermDays : ''}
                    onChange={(e) => {
                      const raw = e.target.value
                      setForm({
                        ...form,
                        creditTermDays: raw === '' ? Number.NaN : Number(raw),
                      })
                    }}
                    onBlur={() =>
                      setForm((current) => ({
                        ...current,
                        creditTermDays: normalizeCreditTermDays(current.creditTermDays),
                      }))
                    }
                    className="bg-surface text-fg px-4 py-2.5 font-mono text-xs outline-none font-bold"
                  />
                </div>
                <p className="pb-1 text-[10px] text-fg-muted">
                  Entre {CREDIT_TERM_DAYS_MIN} y {CREDIT_TERM_DAYS_MAX}. Vence el mes siguiente.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                    Selección rápida
                  </span>
                  <span className="text-[10px] text-fg-muted">
                    Actual:{' '}
                    <strong className="text-fg">día {creditTermDays}</strong>
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-6 gap-1 sm:grid-cols-10">
                  {CREDIT_TERM_DAY_OPTIONS.map((day) => {
                    const isActive = day === creditTermDays
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setForm({ ...form, creditTermDays: day })}
                        className={`h-7 rounded border font-mono text-[10px] font-bold transition-colors ${
                          isActive
                            ? 'border-accent bg-accent text-white'
                            : 'border-line-soft bg-surface text-fg-muted hover:border-accent hover:text-fg'
                        }`}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-col rounded border border-line-dim bg-panel/40 p-3 text-[11px] text-fg-muted">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-accent/40 bg-accent/10 text-accent">
                  <CalendarClock className="w-4 h-4" />
                </span>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-fg">
                    Ejemplo
                  </div>
                  <div className="text-[10px] text-fg-muted">Así queda el vencimiento</div>
                </div>
              </div>

              <div className="mt-3 rounded border border-accent/30 bg-accent/5 px-3 py-2.5">
                <div className="text-[9px] font-bold uppercase tracking-wider text-fg-muted">
                  Vence
                </div>
                <div className="mt-0.5 text-sm font-bold text-accent">
                  Día {creditTermDays} de cada mes
                </div>
              </div>

              <p className="mt-3 leading-relaxed">
                Si elige el día <strong className="text-fg">{creditTermDays}</strong>, cada factura
                a crédito vence el{' '}
                <strong className="text-fg">{creditTermDays} del mes siguiente</strong> a la venta.
                El cliente puede pagar antes o ese mismo día sin quedar en mora.
              </p>

              <p className="mt-auto border-t border-line-dim pt-2">
                Aplica a las <strong className="text-fg">nuevas</strong> ventas a crédito. Las
                facturas ya creadas conservan la fecha de vencimiento con la que nacieron.
              </p>
            </div>
          </div>
        </div>
      </SectionPanel>

      <div className="flex justify-end">
        <TacticalButton
          type="submit"
          variant="primary"
          size="md"
          loading={saving}
          icon={<Save className="w-4 h-4" />}
        >
          GUARDAR INFORMACIÓN CORPORATIVA
        </TacticalButton>
      </div>
    </form>
  )
}
