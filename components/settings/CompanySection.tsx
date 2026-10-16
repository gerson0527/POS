'use client'

import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useToast } from '@/components/ui/ToastProvider'
import { getCompanyInfo, updateCompanyInfo } from '@/app/actions/pos-actions'

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
      })
      toast('¡CONFIGURACIÓN DE EMPRESA Y PARAMETROS GUARDADOS CORRECTAMENTE!')
    } catch (err: any) {
      toast(`Error al guardar configuración: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionPanel
      title="INFORMACIÓN CORPORATIVA Y NIT"
      subtitle="DATOS EDITABLES REGISTRADOS ANTE LA DIAN COLOMBIA"
      statusSlot={<StatusBadge status="online" label="EDITABLE OK" />}
    >
      <form onSubmit={handleSaveCompanyInfo} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
          <div className="space-y-1.5">
            <Label>
              RAZÓN SOCIAL / NOMBRE DE EMPRESA *
            </Label>
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
            <Label>
              NÚMERO DE IDENTIFICACIÓN TRIBUTARIA (NIT) *
            </Label>
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
            <Label>
              CORREO ELECTRÓNICO FISCAL (NOTIFICACIONES DIAN)
            </Label>
            <Input
              type="email"
              placeholder="facturacion@miempresa.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="bg-surface text-fg px-4 py-2.5 font-mono text-xs outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>
              TELÉFONO DE CONTACTO PRINCIPAL
            </Label>
            <Input
              type="text"
              placeholder="Ej: +57 601 555 0199 / 300 123 4567"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="bg-surface text-fg px-4 py-2.5 font-mono text-xs outline-none"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>
              DIRECCIÓN FÍSICA Y CIUDAD DE OPERACIÓN
            </Label>
            <Input
              type="text"
              placeholder="Ej: Carrera 7 # 71-21, Bogotá D.C., Colombia"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="bg-surface text-fg px-4 py-2.5 font-mono text-xs outline-none"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-line-faint flex justify-end">
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
    </SectionPanel>
  )
}
