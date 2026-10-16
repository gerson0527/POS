'use client'

import { useState, useEffect } from 'react'
import { Hash, Plus, FileText, Edit2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Label } from '@/components/ui/Label'
import {
  getNumerations,
  createNumeration,
  updateNumeration,
  deleteNumeration,
} from '@/app/actions/pos-actions'
import type { NumerationItem } from './types'

const documentTypeLabels: Record<string, string> = {
  INVOICE: 'FACTURA ELECTRÓNICA DE VENTA',
  POS_INVOICE: 'TIQUETE ELECTRÓNICO POS',
  CREDIT_NOTE: 'NOTA CRÉDITO ELECTRÓNICA',
  DEBIT_NOTE: 'NOTA DÉBITO ELECTRÓNICA',
}

const EMPTY_NUMERATION_FORM = {
  resolution: '',
  prefix: '',
  startRange: 1,
  endRange: 50000,
  currentNumber: 1,
  documentType: 'INVOICE',
}

interface NumerationsSectionProps {
  refreshKey?: number
  onLoadingChange?: (loading: boolean) => void
}

export function NumerationsSection({ refreshKey = 0, onLoadingChange }: NumerationsSectionProps) {
  const { toast } = useToast()
  const confirmAction = useConfirm()

  const [saving, setSaving] = useState(false)
  const [numerations, setNumerations] = useState<NumerationItem[]>([])
  const [showNumerationForm, setShowNumerationForm] = useState(false)
  const [editingNumerationId, setEditingNumerationId] = useState<string | null>(null)
  const [numerationForm, setNumerationForm] = useState(EMPTY_NUMERATION_FORM)

  useEffect(() => {
    let cancelled = false
    onLoadingChange?.(true)
    ;(async () => {
      try {
        const data = await getNumerations()
        if (!cancelled) setNumerations(data as NumerationItem[])
      } catch (err) {
        console.error('Error al cargar resoluciones:', err)
      } finally {
        if (!cancelled) onLoadingChange?.(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  async function loadNumerationsData() {
    try {
      const data = await getNumerations()
      setNumerations(data as NumerationItem[])
    } catch (err) {
      console.error('Error al cargar resoluciones:', err)
    }
  }

  function openNewNumerationForm() {
    setEditingNumerationId(null)
    setNumerationForm({
      ...EMPTY_NUMERATION_FORM,
      prefix: 'FE',
    })
    setShowNumerationForm(true)
  }

  function openEditNumerationForm(num: NumerationItem) {
    setEditingNumerationId(num.id)
    setNumerationForm({
      resolution: num.resolution,
      prefix: num.prefix,
      startRange: num.startRange,
      endRange: num.endRange,
      currentNumber: num.currentNumber,
      documentType: num.documentType,
    })
    setShowNumerationForm(true)
  }

  async function handleSaveNumeration(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      if (editingNumerationId) {
        await updateNumeration(editingNumerationId, {
          resolution: numerationForm.resolution,
          prefix: numerationForm.prefix,
          startRange: numerationForm.startRange,
          endRange: numerationForm.endRange,
          currentNumber: numerationForm.currentNumber,
          documentType: numerationForm.documentType,
        })
        toast('¡RESOLUCIÓN DIAN ACTUALIZADA CON ÉXITO!')
      } else {
        await createNumeration({
          resolution: numerationForm.resolution,
          prefix: numerationForm.prefix,
          startRange: numerationForm.startRange,
          endRange: numerationForm.endRange,
          currentNumber: numerationForm.currentNumber,
          documentType: numerationForm.documentType,
        })
        toast('¡RESOLUCIÓN FISCAL REGISTRADA CORRECTAMENTE!')
      }
      setShowNumerationForm(false)
      await loadNumerationsData()
    } catch (err: any) {
      toast(`Error al guardar resolución DIAN: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleNumerationStatus(num: NumerationItem) {
    const newStatus = num.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    try {
      await updateNumeration(num.id, { status: newStatus })
      toast(`¡RESOLUCIÓN ${num.resolution} CAMBIADA A ${newStatus}!`)
      await loadNumerationsData()
    } catch (err: any) {
      toast(`Error al actualizar estado de resolución: ${err.message}`, 'error')
    }
  }

  async function handleDeleteNumeration(id: string) {
    if (!(await confirmAction({ title: 'CONFIRMAR ELIMINACIÓN', message: '¿Está seguro de eliminar esta resolución fiscal DIAN?', confirmLabel: 'ELIMINAR', tone: 'danger' }))) return
    try {
      await deleteNumeration(id)
      toast('¡RESOLUCIÓN ELIMINADA CON ÉXITO!')
      await loadNumerationsData()
    } catch (err: any) {
      toast(`Error al eliminar resolución: ${err.message}`, 'error')
    }
  }

  return (
    <SectionPanel
      title="NUMERACIÓN Y RESOLUCIONES FISCALES DIAN"
      subtitle="CONFIGURACIÓN DE RANGOS DE FACTURACIÓN Y DOCUMENTOS ELECTRÓNICOS"
      action={
        <TacticalButton
          variant="primary"
          size="sm"
          onClick={openNewNumerationForm}
          icon={<Plus className="w-3.5 h-3.5" />}
        >
          REGISTRAR RESOLUCIÓN
        </TacticalButton>
      }
    >
      <div className="space-y-6 font-mono text-xs">
        {/* Form Create / Edit Resolution */}
        {showNumerationForm && (
          <form
            onSubmit={handleSaveNumeration}
            className="bg-surface border border-accent/40 rounded p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-line pb-2">
              <span className="font-bold text-accent uppercase tracking-wider flex items-center gap-2">
                <Hash className="w-4 h-4" />
                {editingNumerationId ? 'EDITAR RESOLUCIÓN FISCAL DIAN' : 'CREAR NUEVA RESOLUCIÓN DIAN'}
              </span>
              <button
                type="button"
                onClick={() => setShowNumerationForm(false)}
                className="text-fg-muted hover:text-white text-xs font-bold uppercase"
              >
                [CANCELAR]
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>
                  NÚMERO DE RESOLUCIÓN DIAN *
                </Label>
                <Input
                  type="text"
                  required
                  placeholder="Ej: 18760000001"
                  value={numerationForm.resolution}
                  onChange={(e) => setNumerationForm({ ...numerationForm, resolution: e.target.value })}
                  className="bg-raised text-fg px-4 py-2 outline-none"
                />
              </div>

              <div className="space-y-1">
                <Label>
                  TIPO DE DOCUMENTO *
                </Label>
                <Select
                  value={numerationForm.documentType}
                  onChange={(e) => setNumerationForm({ ...numerationForm, documentType: e.target.value })}
                  className="bg-raised text-fg px-4 py-2 outline-none font-normal"
                >
                  <option value="INVOICE">FACTURA ELECTRÓNICA DE VENTA (01)</option>
                  <option value="POS_INVOICE">TIQUETE ELECTRÓNICO POS (05)</option>
                  <option value="CREDIT_NOTE">NOTA CRÉDITO ELECTRÓNICA (91)</option>
                  <option value="DEBIT_NOTE">NOTA DÉBITO ELECTRÓNICA (92)</option>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>
                  PREFIJO DE FACTURACIÓN *
                </Label>
                <Input
                  type="text"
                  required
                  placeholder="Ej: SETT / FE / POS"
                  value={numerationForm.prefix}
                  onChange={(e) => setNumerationForm({ ...numerationForm, prefix: e.target.value })}
                  className="bg-raised text-fg px-4 py-2 outline-none font-bold uppercase"
                />
              </div>

              <div className="space-y-1">
                <Label>
                  CONSECUTIVO / NÚMERO ACTUAL *
                </Label>
                <Input
                  type="number"
                  required
                  min="1"
                  placeholder="Ej: 1"
                  value={numerationForm.currentNumber}
                  onChange={(e) => setNumerationForm({ ...numerationForm, currentNumber: parseInt(e.target.value) || 1 })}
                  className="bg-raised text-fg px-4 py-2 outline-none font-bold text-accent"
                />
              </div>

              <div className="space-y-1">
                <Label>
                  RANGO INICIAL *
                </Label>
                <Input
                  type="number"
                  required
                  min="1"
                  placeholder="1"
                  value={numerationForm.startRange}
                  onChange={(e) => setNumerationForm({ ...numerationForm, startRange: parseInt(e.target.value) || 1 })}
                  className="bg-raised text-fg px-4 py-2 outline-none"
                />
              </div>

              <div className="space-y-1">
                <Label>
                  RANGO FINAL *
                </Label>
                <Input
                  type="number"
                  required
                  min="1"
                  placeholder="50000"
                  value={numerationForm.endRange}
                  onChange={(e) => setNumerationForm({ ...numerationForm, endRange: parseInt(e.target.value) || 50000 })}
                  className="bg-raised text-fg px-4 py-2 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <TacticalButton
                type="submit"
                variant="primary"
                size="md"
                loading={saving}
                icon={<Plus className="w-4 h-4" />}
              >
                {editingNumerationId ? 'GUARDAR CAMBIOS RESOLUCIÓN' : 'REGISTRAR RESOLUCIÓN'}
              </TacticalButton>
            </div>
          </form>
        )}

        {/* Resolutions List */}
        {numerations.length === 0 ? (
          <div className="py-12 text-center font-mono text-xs text-fg-muted border border-dashed border-line rounded bg-surface">
            [NO HAY RESOLUCIONES FISCALES REGISTRADAS // HAS CLIC EN "REGISTRAR RESOLUCIÓN"]
          </div>
        ) : (
          <div className="space-y-4">
            {numerations.map((num) => {
              const totalRange = num.endRange - num.startRange + 1
              const usedCount = Math.max(0, num.currentNumber - num.startRange)
              const percentUsed = Math.min(100, Math.round((usedCount / totalRange) * 100))

              return (
                <div
                  key={num.id}
                  className="bg-surface border border-line rounded-[6px] p-5 space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line-faint pb-3">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-accent" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-fg text-sm">
                            RESOLUCIÓN N° {num.resolution}
                          </span>
                          <span className="px-2 py-0.5 bg-accent/10 border border-accent/30 text-accent font-bold text-[10px] rounded">
                            PREFIJO: {num.prefix}
                          </span>
                        </div>
                        <span className="text-[10px] text-fg-muted uppercase">
                          {documentTypeLabels[num.documentType] || num.documentType}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <StatusBadge
                        status={num.status === 'ACTIVE' ? 'online' : 'offline'}
                        label={num.status === 'ACTIVE' ? 'ACTIVA / EN USO' : 'INACTIVA'}
                      />
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openEditNumerationForm(num)}
                          className="p-1.5 bg-raised border border-line text-fg hover:text-accent hover:border-accent rounded transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleNumerationStatus(num)}
                          className="p-1.5 bg-raised border border-line text-fg-muted hover:text-white rounded transition-colors"
                          title={num.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                        >
                          {num.status === 'ACTIVE' ? (
                            <ToggleRight className="w-3.5 h-3.5 text-success-solid" />
                          ) : (
                            <ToggleLeft className="w-3.5 h-3.5 text-alert" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteNumeration(num.id)}
                          className="p-1.5 bg-raised border border-line text-alert hover:bg-alert hover:text-white rounded transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar & Range Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div className="bg-raised p-3 rounded border border-line-soft">
                      <span className="text-[10px] text-fg-muted block uppercase font-bold">RANGO HABILITADO</span>
                      <span className="text-fg font-bold mt-0.5 block">
                        {num.prefix}{num.startRange} — {num.prefix}{num.endRange}
                      </span>
                    </div>

                    <div className="bg-raised p-3 rounded border border-line-soft">
                      <span className="text-[10px] text-fg-muted block uppercase font-bold">CONSECUTIVO ACTUAL</span>
                      <span className="text-accent font-bold mt-0.5 block">
                        {num.prefix}{num.currentNumber}
                      </span>
                    </div>

                    <div className="bg-raised p-3 rounded border border-line-soft">
                      <span className="text-[10px] text-fg-muted block uppercase font-bold">DISPONIBILIDAD DE RANGO</span>
                      <span className="text-fg font-bold mt-0.5 block">
                        {num.endRange - num.currentNumber + 1} FACTURAS
                      </span>
                    </div>
                  </div>

                  {/* Progress meter */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-fg-muted font-bold">
                      <span>USO DE RANGO: {percentUsed}%</span>
                      <span>TOTAL: {totalRange} NÚMEROS</span>
                    </div>
                    <div className="w-full bg-raised h-2 rounded overflow-hidden border border-line">
                      <div
                        className="bg-accent h-full transition-all duration-500"
                        style={{ width: `${percentUsed}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </SectionPanel>
  )
}
