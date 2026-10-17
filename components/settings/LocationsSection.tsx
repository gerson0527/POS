'use client'

import { useState, useEffect } from 'react'
import { MapPin, Save, Plus, Edit2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Pagination } from '@/components/tactical/Pagination'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { DataTable } from '@/components/ui/DataTable'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import {
  getAllLocations,
  createLocation,
  updateLocation,
  deleteLocation,
} from '@/app/actions/pos-actions'
import type { LocationItem } from './types'

const ITEMS_PER_PAGE = 5

interface LocationsSectionProps {
  refreshKey?: number
  onLoadingChange?: (loading: boolean) => void
}

export function LocationsSection({ refreshKey = 0, onLoadingChange }: LocationsSectionProps) {
  const { toast } = useToast()
  const confirmAction = useConfirm()

  const [saving, setSaving] = useState(false)
  const [locations, setLocations] = useState<LocationItem[]>([])
  const [showLocationForm, setShowLocationForm] = useState(false)
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [locationForm, setLocationForm] = useState({
    name: '',
    code: '',
    address: '',
    phone: '',
  })
  const [locationsPage, setLocationsPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    onLoadingChange?.(true)
    ;(async () => {
      try {
        const data = await getAllLocations()
        if (!cancelled) setLocations(data as LocationItem[])
      } catch (err) {
        console.error('Error al cargar ubicaciones:', err)
      } finally {
        if (!cancelled) onLoadingChange?.(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  async function loadLocationsData() {
    try {
      const data = await getAllLocations()
      setLocations(data as LocationItem[])
    } catch (err) {
      console.error('Error al cargar ubicaciones:', err)
    }
  }

  function openNewLocationForm() {
    setEditingLocationId(null)
    setLocationForm({ name: '', code: `LOC-${locations.length + 1}`, address: '', phone: '' })
    setShowLocationForm(true)
  }

  function openEditLocationForm(loc: LocationItem) {
    setEditingLocationId(loc.id)
    setLocationForm({
      name: loc.name,
      code: loc.code,
      address: loc.address || '',
      phone: loc.phone || '',
    })
    setShowLocationForm(true)
  }

  async function handleSaveLocation(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      if (editingLocationId) {
        await updateLocation(editingLocationId, {
          name: locationForm.name,
          code: locationForm.code,
          address: locationForm.address,
          phone: locationForm.phone,
        })
        toast('¡SEDE ACTUALIZADA CON ÉXITO!')
      } else {
        await createLocation({
          name: locationForm.name,
          code: locationForm.code,
          address: locationForm.address,
          phone: locationForm.phone,
        })
        toast('¡NUEVA SEDE REGISTRADA CORRECTAMENTE!')
      }
      setShowLocationForm(false)
      await loadLocationsData()
    } catch (err: any) {
      toast(`Error al procesar ubicación: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleLocationStatus(loc: LocationItem) {
    const newStatus = loc.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    try {
      await updateLocation(loc.id, { status: newStatus })
      toast(`¡ESTADO DE SEDE CAMBIADO A ${newStatus}!`)
      await loadLocationsData()
    } catch (err: any) {
      toast(`Error al actualizar estado de sede: ${err.message}`, 'error')
    }
  }

  async function handleDeleteLocation(id: string) {
    if (!(await confirmAction({ title: 'CONFIRMAR ELIMINACIÓN', message: '¿Está seguro de eliminar esta ubicación/sede?', confirmLabel: 'ELIMINAR', tone: 'danger' }))) return
    try {
      await deleteLocation(id)
      toast('¡SEDE ELIMINADA CON ÉXITO!')
      await loadLocationsData()
    } catch (err: any) {
      toast(`Error al eliminar sede: ${err.message}`, 'error')
    }
  }

  const totalLocationPages = Math.ceil(locations.length / ITEMS_PER_PAGE) || 1
  const paginatedLocations = locations.slice(
    (locationsPage - 1) * ITEMS_PER_PAGE,
    locationsPage * ITEMS_PER_PAGE
  )

  return (
    <SectionPanel
      title="REGISTRO DE UBICACIONES Y SEDES POS"
      subtitle="GESTIÓN DE PUNTOS DE VENTA Y SUCURSALES"
      action={
        <TacticalButton
          variant="primary"
          size="sm"
          onClick={openNewLocationForm}
          icon={<Plus className="w-3.5 h-3.5" />}
        >
          NUEVA UBICACIÓN
        </TacticalButton>
      }
    >
      <div className="space-y-6">
        {/* Add / Edit Location Form */}
        {showLocationForm && (
          <form
            onSubmit={handleSaveLocation}
            className="bg-surface border border-accent/40 rounded p-5 space-y-4 font-mono text-xs"
          >
            <div className="flex items-center justify-between border-b border-line pb-2">
              <span className="font-bold text-accent uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {editingLocationId ? 'EDITAR SEDE / UBICACIÓN' : 'REGISTRAR NUEVA SEDE / SUCURSAL'}
              </span>
              <button
                type="button"
                onClick={() => setShowLocationForm(false)}
                className="text-fg-muted hover:text-alert text-xs font-semibold uppercase"
              >
                [CANCELAR]
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>
                  NOMBRE DE LA SEDE *
                </Label>
                <Input
                  type="text"
                  required
                  placeholder="Ej: Sede Principal Zona Norte"
                  value={locationForm.name}
                  onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                  className="bg-raised text-fg px-3 py-2 outline-none"
                />
              </div>

              <div className="space-y-1">
                <Label>
                  CÓDIGO INTERNO SEDE *
                </Label>
                <Input
                  type="text"
                  required
                  placeholder="Ej: LOC-001"
                  value={locationForm.code}
                  onChange={(e) => setLocationForm({ ...locationForm, code: e.target.value })}
                  className="bg-raised text-fg px-3 py-2 outline-none font-bold"
                />
              </div>

              <div className="space-y-1">
                <Label>DIRECCIÓN FÍSICA</Label>
                <Input
                  type="text"
                  placeholder="Ej: Av. Calle 80 # 45-12"
                  value={locationForm.address}
                  onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })}
                  className="bg-raised text-fg px-3 py-2 outline-none"
                />
              </div>

              <div className="space-y-1">
                <Label>TELÉFONO DE LA SEDE</Label>
                <Input
                  type="text"
                  placeholder="Ej: 601 234 5678"
                  value={locationForm.phone}
                  onChange={(e) => setLocationForm({ ...locationForm, phone: e.target.value })}
                  className="bg-raised text-fg px-3 py-2 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <TacticalButton
                type="submit"
                variant="primary"
                size="sm"
                loading={saving}
                icon={<Save className="w-3.5 h-3.5" />}
              >
                {editingLocationId ? 'GUARDAR CAMBIOS' : 'CREAR SEDE'}
              </TacticalButton>
            </div>
          </form>
        )}

        {/* Locations Table */}
        <DataTable
          columns={[
            {
              key: 'code',
              header: 'CÓDIGO',
              cellClassName: 'font-bold text-accent',
              render: (loc: LocationItem) => loc.code,
            },
            {
              key: 'name',
              header: 'NOMBRE SEDE',
              cellClassName: 'font-bold',
              render: (loc: LocationItem) => loc.name,
            },
            {
              key: 'address',
              header: 'DIRECCIÓN',
              cellClassName: 'text-fg-muted',
              render: (loc: LocationItem) => loc.address || '—',
            },
            {
              key: 'phone',
              header: 'TELÉFONO',
              cellClassName: 'text-fg-muted',
              render: (loc: LocationItem) => loc.phone || '—',
            },
            {
              key: 'status',
              header: 'ESTADO',
              render: (loc: LocationItem) => (
                <StatusBadge
                  status={loc.status === 'ACTIVE' ? 'online' : 'offline'}
                  label={loc.status === 'ACTIVE' ? 'ACTIVA' : 'INACTIVA'}
                />
              ),
            },
            {
              key: 'actions',
              header: 'ACCIONES',
              align: 'right',
              render: (loc: LocationItem) => (
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => openEditLocationForm(loc)}
                    className="p-1.5 bg-raised border border-line text-fg hover:text-accent hover:border-accent rounded transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleToggleLocationStatus(loc)}
                    className="p-1.5 bg-raised border border-line text-fg-muted hover:text-fg rounded transition-colors"
                    title={loc.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                  >
                    {loc.status === 'ACTIVE' ? (
                      <ToggleRight className="w-3.5 h-3.5 text-success-solid" />
                    ) : (
                      <ToggleLeft className="w-3.5 h-3.5 text-alert" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteLocation(loc.id)}
                    className="p-1.5 bg-raised border border-line text-alert hover:bg-alert hover:text-white rounded transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ),
            },
          ]}
          rows={paginatedLocations}
          rowKey={(loc: LocationItem) => loc.id}
          emptyMessage={'[NO HAY UBICACIONES SECUNDARIAS REGISTRADAS // PRESIONA "NUEVA UBICACIÓN"]'}
          wrapperClassName="overflow-x-auto border border-line rounded-[6px]"
          tableClassName="w-full font-mono text-xs text-left text-fg"
          theadClassName="bg-raised border-b border-line text-[10px] text-fg-muted uppercase tracking-wider"
          tbodyClassName="divide-y divide-line-faint bg-surface"
        />

        <Pagination
          currentPage={locationsPage}
          totalPages={totalLocationPages}
          totalItems={locations.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={(page) => setLocationsPage(page)}
        />
      </div>
    </SectionPanel>
  )
}
