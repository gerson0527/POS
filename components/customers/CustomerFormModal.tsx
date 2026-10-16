'use client'

import { IdCard, FileText, Mail, MapPin, Phone, User, UserPlus } from 'lucide-react'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { TextArea } from '@/components/ui/TextArea'

export interface CustomerFormValues {
  documentType: string
  documentNumber: string
  name: string
  email: string
  phone: string
  address?: string
  city?: string
  department?: string
  tradeName?: string
  personType?: string
  taxRegime?: string
  notes?: string
}

export interface CustomerDocType {
  code: string
  label?: string
}

interface CustomerFormModalProps {
  compact?: boolean
  isEditMode?: boolean
  open?: boolean
  onSubmit: (e: React.FormEvent) => void
  form: CustomerFormValues
  onChange: (next: CustomerFormValues) => void
  docTypes: CustomerDocType[]
  taxRegimes?: CustomerDocType[]
  saving?: boolean
  error?: string | null
  onCancel: () => void
  onClose?: () => void
}

export function CustomerFormModal({
  compact = false,
  isEditMode = false,
  open = true,
  onSubmit,
  form,
  onChange,
  docTypes,
  taxRegimes = [],
  saving = false,
  error = null,
  onCancel,
  onClose,
}: CustomerFormModalProps) {
  if (compact) {
    return (
      <form onSubmit={onSubmit} className="space-y-1.5 pt-2 mt-2 border-t border-line-soft">
        <div className="grid grid-cols-2 gap-1.5">
          <Select
            value={form.documentType}
            onChange={(e) => onChange({ ...form, documentType: e.target.value })}
            className="text-fg px-2 py-1 font-mono text-[11px] uppercase outline-none font-normal"
          >
            {docTypes.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code}
              </option>
            ))}
          </Select>
          <Input
            type="text"
            required
            placeholder="N° Documento *"
            value={form.documentNumber}
            onChange={(e) => onChange({ ...form, documentNumber: e.target.value })}
            className="text-fg px-2 py-1 font-mono text-[11px] outline-none"
          />
        </div>
        <Input
          type="text"
          required
          placeholder="Nombre / Razón Social *"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          className="text-fg px-2 py-1 font-mono text-[11px] outline-none"
        />
        <div className="grid grid-cols-2 gap-1.5">
          <div className="relative">
            <Mail className="w-3 h-3 text-line-strong absolute left-2 top-1/2 -translate-y-1/2" />
            <Input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => onChange({ ...form, email: e.target.value })}
              className="text-fg pl-6 pr-2 py-1 font-mono text-[11px] outline-none"
            />
          </div>
          <div className="relative">
            <Phone className="w-3 h-3 text-line-strong absolute left-2 top-1/2 -translate-y-1/2" />
            <Input
              type="tel"
              placeholder="Teléfono"
              value={form.phone}
              onChange={(e) => onChange({ ...form, phone: e.target.value })}
              className="text-fg pl-6 pr-2 py-1 font-mono text-[11px] outline-none"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-1 text-[10px] text-alert font-bold">
            <IdCard className="w-3 h-3" />
            {error}
          </div>
        )}

        <div className="flex items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 flex items-center justify-center gap-1 text-[10px] text-fg-muted hover:text-fg font-bold uppercase py-1 rounded border border-line transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="flex-1 flex items-center justify-center gap-1 text-[10px] text-accent hover:text-white hover:bg-accent font-bold uppercase py-1 rounded border border-accent transition-colors"
          >
            Guardar
          </button>
        </div>
      </form>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose ?? onCancel}
      title={isEditMode ? 'EDITAR CLIENTE' : 'REGISTRAR NUEVO CLIENTE'}
      icon={<UserPlus className="w-4 h-4" />}
      size="2xl"
    >
      <form onSubmit={onSubmit} className="space-y-5 text-xs">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[10px] font-bold text-fg-muted tracking-widest uppercase">
            <IdCard className="w-3 h-3 text-accent" />
            Identificación fiscal
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              value={form.documentType}
              onChange={(e) => {
                const newType = e.target.value
                onChange({
                  ...form,
                  documentType: newType,
                  personType: newType === 'NIT' ? 'JURIDICA' : 'NATURAL',
                })
              }}
              className="font-normal"
            >
              {docTypes.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </Select>
            <Input
              type="text"
              required
              placeholder="N° Documento *"
              value={form.documentNumber}
              onChange={(e) => onChange({ ...form, documentNumber: e.target.value })}
              className="sm:col-span-2"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              value={form.personType ?? ''}
              onChange={(e) => onChange({ ...form, personType: e.target.value })}
              className="font-normal"
            >
              <option value="NATURAL">Persona Natural</option>
              <option value="JURIDICA">Persona Jurídica</option>
            </Select>
            <Select
              value={form.taxRegime ?? ''}
              onChange={(e) => onChange({ ...form, taxRegime: e.target.value })}
              className="font-normal"
            >
              <option value="">Régimen tributario (opcional)</option>
              {taxRegimes.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-3 border-t border-line-dim pt-4">
          <div className="flex items-center gap-2 text-[10px] font-bold text-fg-muted tracking-widest uppercase">
            <User className="w-3 h-3 text-accent" />
            Datos del cliente
          </div>
          <Input
            type="text"
            required
            placeholder="Nombre completo / Razón social *"
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
          />
          <Input
            type="text"
            placeholder="Nombre comercial (opcional)"
            value={form.tradeName ?? ''}
            onChange={(e) => onChange({ ...form, tradeName: e.target.value })}
          />
        </div>

        <div className="space-y-3 border-t border-line-dim pt-4">
          <div className="flex items-center gap-2 text-[10px] font-bold text-fg-muted tracking-widest uppercase">
            <Mail className="w-3 h-3 text-accent" />
            Contacto
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-line-strong absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                type="email"
                placeholder="Email (factura electrónica)"
                value={form.email}
                onChange={(e) => onChange({ ...form, email: e.target.value })}
                className="pl-8 pr-2.5 py-2.5"
              />
            </div>
            <div className="relative">
              <Phone className="w-3.5 h-3.5 text-line-strong absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                type="tel"
                placeholder="Teléfono"
                value={form.phone}
                onChange={(e) => onChange({ ...form, phone: e.target.value })}
                className="pl-8 pr-2.5 py-2.5"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t border-line-dim pt-4">
          <div className="flex items-center gap-2 text-[10px] font-bold text-fg-muted tracking-widest uppercase">
            <MapPin className="w-3 h-3 text-accent" />
            Ubicación
          </div>
          <Input
            type="text"
            placeholder="Dirección"
            value={form.address ?? ''}
            onChange={(e) => onChange({ ...form, address: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="text"
              placeholder="Ciudad / Municipio"
              value={form.city ?? ''}
              onChange={(e) => onChange({ ...form, city: e.target.value })}
            />
            <Input
              type="text"
              placeholder="Departamento"
              value={form.department ?? ''}
              onChange={(e) => onChange({ ...form, department: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-3 border-t border-line-dim pt-4">
          <div className="flex items-center gap-2 text-[10px] font-bold text-fg-muted tracking-widest uppercase">
            <FileText className="w-3 h-3 text-accent" />
            Notas internas
          </div>
          <TextArea
            placeholder="Anotaciones privadas del cliente (no aparece en la factura)..."
            rows={2}
            value={form.notes ?? ''}
            onChange={(e) => onChange({ ...form, notes: e.target.value })}
            className="w-full bg-input border border-line focus:border-accent p-2.5 rounded text-white resize-none"
          />
        </div>

        {error && (
          <div className="bg-alert-dim border border-alert-line text-danger p-2.5 rounded text-xs font-bold">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-line-dim">
          <TacticalButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            CANCELAR
          </TacticalButton>
          <TacticalButton type="submit" variant="primary" size="sm" loading={saving}>
            {isEditMode ? 'GUARDAR CAMBIOS' : 'REGISTRAR CLIENTE'}
          </TacticalButton>
        </div>
      </form>
    </Modal>
  )
}
