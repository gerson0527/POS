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
  getFactusConfigForCurrentTenant,
  fetchFactusNumberingRanges,
} from '@/app/actions/pos-actions'
import {
  NUMERATION_DOCUMENT_TYPES,
  NUMERATION_DOCUMENT_TYPE_LABELS,
} from '@/lib/fiscal/numeration'
import { formatInvoiceNumber } from '@/lib/utils/pos-utils'
import type { NumerationItem } from './types'

const EMPTY_NUMERATION_FORM = {
  resolution: '',
  prefix: 'REC',
  startRange: 1,
  endRange: 999999,
  currentNumber: 0,
  documentType: 'DOCUMENTO_EQUIVALENTE_POS',
}

type FactusRangeItem = {
  id: number
  prefix: string
  from: number
  to: number
  current: number
  status: string
  document?: string
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
  const [factusRangeId, setFactusRangeId] = useState(0)
  const [factusRanges, setFactusRanges] = useState<FactusRangeItem[]>([])
  const [factusRangesError, setFactusRangesError] = useState<string | null>(null)
  const [showNumerationForm, setShowNumerationForm] = useState(false)
  const [editingNumerationId, setEditingNumerationId] = useState<string | null>(null)
  const [numerationForm, setNumerationForm] = useState(EMPTY_NUMERATION_FORM)

  useEffect(() => {
    let cancelled = false
    onLoadingChange?.(true)
    ;(async () => {
      try {
        const [data, factusConfig] = await Promise.all([
          getNumerations(),
          getFactusConfigForCurrentTenant(),
        ])
        if (!cancelled) {
          setNumerations(data as NumerationItem[])
          setFactusRangeId(Number(factusConfig?.factusNumberingRangeId ?? 0))
        }
      } catch (err) {
        console.error('Error al cargar resoluciones:', err)
      }

      // El rango oficial de facturación electrónica es de solo lectura y lo
      // administra Factus: si falla la consulta, no rompe el resto de la sección.
      try {
        const ranges = await fetchFactusNumberingRanges()
        if (!cancelled) {
          setFactusRanges(ranges)
          setFactusRangesError(null)
        }
      } catch (err) {
        console.error('Error al consultar rangos de Factus:', err)
        if (!cancelled) setFactusRangesError('No se pudo consultar el rango oficial en Factus.')
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
    setNumerationForm({ ...EMPTY_NUMERATION_FORM })
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
      title="NUMERACIÓN DE COMPROBANTES Y RESOLUCIONES"
      subtitle="CONSECUTIVOS INTERNOS DEL POS · LA NUMERACIÓN ELECTRÓNICA LA ASIGNA FACTUS"
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
        <div className="bg-surface border border-line rounded p-3 text-[11px] text-fg-muted leading-relaxed">
          La numeración oficial de las facturas electrónicas la asigna{' '}
          <strong className="text-fg">FACTUS</strong>
          {factusRangeId > 0 ? ` con el rango N° ${factusRangeId}` : ''} (se configura en{' '}
          <strong className="text-fg">FACTURACIÓN ELECTRÓNICA</strong>). Esta sección controla los
          consecutivos internos del POS y los documentos no electrónicos.
        </div>

        {/* Rango oficial de Factus (solo lectura) */}
        {factusRangeId > 0 && (
          <div className="bg-surface border border-line rounded p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase text-fg-muted">
                RANGO ELECTRÓNICO OFICIAL · FACTUS (SOLO LECTURA)
              </span>
              <span className="text-[10px] text-fg-muted">
                RANGO CONFIGURADO: N° {factusRangeId}
              </span>
            </div>

            {factusRangesError ? (
              <p className="text-[11px] text-danger">{factusRangesError}</p>
            ) : factusRanges.length === 0 ? (
              <p className="text-[11px] text-fg-muted">
                Sin datos del proveedor. Use “LISTAR RANGOS DEL PROVEEDOR” en FACTURACIÓN ELECTRÓNICA.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] font-mono">
                  <thead>
                    <tr className="text-fg-muted uppercase">
                      <th className="text-left px-2 py-1">Documento</th>
                      <th className="text-left px-2 py-1">Prefijo</th>
                      <th className="text-left px-2 py-1">Rango</th>
                      <th className="text-left px-2 py-1">Último asignado</th>
                      <th className="text-left px-2 py-1">Próximo</th>
                      <th className="text-left px-2 py-1">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {factusRanges.map((r) => (
                      <tr key={r.id} className={r.id === factusRangeId ? 'bg-accent/10' : ''}>
                        <td className="px-2 py-1.5 text-fg-muted">{r.document || '—'}</td>
                        <td className="px-2 py-1.5 text-fg font-bold">{r.prefix || '—'}</td>
                        <td className="px-2 py-1.5 text-fg-muted">
                          {r.from > 0 && r.to > 0 ? `${r.from} - ${r.to}` : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-fg-muted">
                          {r.current > 1 ? `${r.prefix}${r.current - 1}` : '— (ninguno)'}
                        </td>
                        <td className="px-2 py-1.5 text-accent font-bold">
                          {r.current > 0 ? `${r.prefix}${r.current}` : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-fg-muted">{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-[10px] text-fg-muted mt-2">
              Es el secuencial oficial que asigna Factus/DIAN: no se edita aquí y siempre manda sobre
              el consecutivo local.
            </p>
          </div>
        )}

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
                className="text-fg-muted hover:text-fg text-xs font-bold uppercase"
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
                  {NUMERATION_DOCUMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {NUMERATION_DOCUMENT_TYPE_LABELS[type] ?? type}
                    </option>
                  ))}
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
                  ÚLTIMO CONSECUTIVO USADO *
                </Label>
                <Input
                  type="number"
                  required
                  min="0"
                  placeholder="0"
                  value={numerationForm.currentNumber}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10)
                    setNumerationForm({
                      ...numerationForm,
                      currentNumber: Number.isNaN(parsed) ? 0 : parsed,
                    })
                  }}
                  className="bg-raised text-fg px-4 py-2 outline-none font-bold text-accent"
                />
                <span className="block text-[10px] text-fg-muted">
                  Use 0 si aún no se ha emitido ninguno (el próximo será 1).
                </span>
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
              const usedCount = Math.max(0, Math.min(totalRange, num.currentNumber - num.startRange + 1))
              const percentUsed = Math.min(100, Math.round((usedCount / totalRange) * 100))
              const nextNumber = Math.min(num.currentNumber + 1, num.endRange)
              const availableCount = Math.max(0, num.endRange - num.currentNumber)

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
                          {NUMERATION_DOCUMENT_TYPE_LABELS[num.documentType] ?? num.documentType}
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
                          className="p-1.5 bg-raised border border-line text-fg-muted hover:text-fg rounded transition-colors"
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                    <div className="bg-raised p-3 rounded border border-line-soft">
                      <span className="text-[10px] text-fg-muted block uppercase font-bold">RANGO HABILITADO</span>
                      <span className="text-fg font-bold mt-0.5 block">
                        {formatInvoiceNumber(num.prefix, num.startRange)} —{' '}
                        {formatInvoiceNumber(num.prefix, num.endRange)}
                      </span>
                    </div>

                    <div className="bg-raised p-3 rounded border border-line-soft">
                      <span className="text-[10px] text-fg-muted block uppercase font-bold">ÚLTIMO USADO</span>
                      <span className="text-accent font-bold mt-0.5 block">
                        {usedCount > 0 ? formatInvoiceNumber(num.prefix, num.currentNumber) : '— NINGUNO —'}
                      </span>
                    </div>

                    <div className="bg-raised p-3 rounded border border-line-soft">
                      <span className="text-[10px] text-fg-muted block uppercase font-bold">PRÓXIMO NÚMERO</span>
                      <span className="text-fg font-bold mt-0.5 block">
                        {formatInvoiceNumber(num.prefix, nextNumber)}
                      </span>
                    </div>

                    <div className="bg-raised p-3 rounded border border-line-soft">
                      <span className="text-[10px] text-fg-muted block uppercase font-bold">DISPONIBILIDAD</span>
                      <span className="text-fg font-bold mt-0.5 block">{availableCount} NÚMEROS</span>
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
