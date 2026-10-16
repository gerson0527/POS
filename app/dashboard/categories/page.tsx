'use client'

import { useState, useEffect } from 'react'
import {
  Tags,
  Plus,
  RefreshCw,
  CheckCircle2,
  Pencil,
  Power,
  Trash2,
  Hash,
  Palette,
  FileText } from 'lucide-react'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Pagination } from '@/components/tactical/Pagination'
import { DataTable } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { TextArea } from '@/components/ui/TextArea'
import { Label } from '@/components/ui/Label'
import { useToast } from '@/components/ui/ToastProvider'
import {
  getProductCategories,
  createProductCategory,
  updateProductCategory,
  toggleProductCategoryStatus,
  deleteProductCategory,
} from '@/app/actions/pos-actions'

const COLOR_PRESETS = [
  '#FF6A00',
  '#10B981',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#F59E0B',
  '#EF4444',
  '#06B6D4',
  '#84CC16',
  '#6366F1',
]

const EMPTY_FORM = {
  name: '',
  description: '',
  color: '#FF6A00',
  icon: '',
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const { toast } = useToast()
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<any>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [reassignTo, setReassignTo] = useState<string>('')

  useEffect(() => {
    loadCategories()
  }, [])

  async function loadCategories() {
    setLoading(true)
    try {
      const data = await getProductCategories(true)
      setCategories(data || [])
    } catch (error) {
      console.error('Error al cargar categorías:', error)
    } finally {
      setLoading(false)
    }
  }

  function openCreateModal() {
    setForm(EMPTY_FORM)
    setIsEditMode(false)
    setEditingId(null)
    setFormError(null)
    setIsModalOpen(true)
  }

  function openEditModal(category: any) {
    setForm({
      name: category.name || '',
      description: category.description || '',
      color: category.color || '#FF6A00',
      icon: category.icon || '',
    })
    setIsEditMode(true)
    setEditingId(category.id)
    setFormError(null)
    setIsModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name?.trim()) {
      setFormError('El nombre es obligatorio.')
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      if (isEditMode && editingId) {
        await updateProductCategory({ id: editingId, ...form })
        toast(`¡CATEGORÍA "${form.name.toUpperCase()}" ACTUALIZADA!`)
      } else {
        await createProductCategory(form)
        toast(`¡CATEGORÍA "${form.name.toUpperCase()}" CREADA!`)
      }
      setIsModalOpen(false)
      setForm(EMPTY_FORM)
      setEditingId(null)
      setIsEditMode(false)
      loadCategories()
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar categoría')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleStatus(category: any) {
    try {
      await toggleProductCategoryStatus(category.id)
      toast(`CATEGORÍA "${category.name.toUpperCase()}" ${category.status === 'ACTIVE' ? 'INACTIVADA' : 'ACTIVADA'}`)
      loadCategories()
    } catch (err: any) {
      toast(`Error: ${err.message}`, 'error')
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteProductCategory(id, reassignTo || undefined)
      toast('CATEGORÍA ELIMINADA')
      setDeleteConfirmId(null)
      setReassignTo('')
      loadCategories()
    } catch (err: any) {
      toast(`Error: ${err.message}`, 'error')
    }
  }

  const filteredCategories = categories.filter((c) => {
    const q = searchQuery.toLowerCase()
    const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.slug?.toLowerCase().includes(q)
    const matchStatus = statusFilter === 'ALL' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalPages = Math.ceil(filteredCategories.length / itemsPerPage) || 1
  const paginatedCategories = filteredCategories.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const stats = {
    total: categories.length,
    active: categories.filter((c) => c.status === 'ACTIVE').length,
    inactive: categories.filter((c) => c.status === 'INACTIVE').length,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Tags className="w-4 h-4" />}
        kicker="PRODUCT TAXONOMY // TAXONOMÍA & ETIQUETAS"
        title="GESTIÓN DE CATEGORÍAS DE PRODUCTOS"
        description="Crea y administra las categorías que organizan el catálogo (Tecnología, Despensa, Aseo, etc.)."
        actions={
          <>
            <TacticalButton
              variant="secondary"
              size="sm"
              onClick={loadCategories}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
            >
              RECARGAR
            </TacticalButton>
            <TacticalButton
              variant="primary"
              size="sm"
              onClick={openCreateModal}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              NUEVA CATEGORÍA
            </TacticalButton>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-panel border border-line rounded-[6px] p-4 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-fg-muted uppercase tracking-wider font-bold">
            <span>TOTAL CATEGORÍAS</span>
            <Tags className="w-4 h-4 text-accent" />
          </div>
          <div className="text-2xl font-bold text-fg">{stats.total}</div>
        </div>
        <div className="bg-panel border border-line rounded-[6px] p-4 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-fg-muted uppercase tracking-wider font-bold">
            <span>ACTIVAS</span>
            <CheckCircle2 className="w-4 h-4 text-ok" />
          </div>
          <div className="text-2xl font-bold text-ok">{stats.active}</div>
        </div>
        <div className="bg-panel border border-line rounded-[6px] p-4 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-fg-muted uppercase tracking-wider font-bold">
            <span>INACTIVAS</span>
            <Power className="w-4 h-4 text-alert" />
          </div>
          <div className="text-2xl font-bold text-alert">{stats.inactive}</div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <SearchInput
          placeholder="BUSCAR POR NOMBRE O SLUG..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setCurrentPage(1)
          }}
          wrapperClassName="flex-1"
        />
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as any)
            setCurrentPage(1)
          }}
          className="bg-surface px-3 py-2 text-xs uppercase outline-none font-normal"
        >
          <option value="ALL">Todos los estados</option>
          <option value="ACTIVE">Activas</option>
          <option value="INACTIVE">Inactivas</option>
        </Select>
      </div>

      <SectionPanel
        title="CATEGORÍAS REGISTRADAS"
        subtitle={`${filteredCategories.length} REGISTRO(S) · PÁGINA ${currentPage} DE ${totalPages}`}
        noPadding
      >
        <DataTable
          columns={[
            {
              key: 'name',
              header: 'Categoría',
              render: (c: any) => (
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded flex items-center justify-center text-black font-bold text-sm shrink-0"
                    style={{ backgroundColor: c.color }}
                  >
                    {c.name?.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-bold text-fg">{c.name}</span>
                </div>
              ),
            },
            {
              key: 'slug',
              header: 'Slug',
              cellClassName: 'text-fg-muted font-mono',
              render: (c: any) => c.slug,
            },
            {
              key: 'description',
              header: 'Descripción',
              cellClassName: 'text-fg max-w-xs truncate',
              render: (c: any) =>
                c.description || <span className="text-fg-faint italic">— Sin descripción —</span>,
            },
            {
              key: 'color',
              header: 'Color',
              render: (c: any) => (
                <div className="flex items-center gap-2">
                  <div
                    className="w-5 h-5 rounded border border-line"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="text-[10px] text-fg-muted font-mono">{c.color}</span>
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Estado',
              render: (c: any) => (
                <StatusBadge
                  status={c.status === 'ACTIVE' ? 'online' : 'critical'}
                  label={c.status === 'ACTIVE' ? 'ACTIVA' : 'INACTIVA'}
                />
              ),
            },
            {
              key: 'actions',
              header: 'Acciones',
              align: 'right',
              render: (c: any) => (
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => openEditModal(c)}
                    className="p-1.5 bg-raised border border-line text-fg hover:border-accent hover:text-accent rounded transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleToggleStatus(c)}
                    className={`p-1.5 bg-raised border rounded transition-colors ${
                      c.status === 'ACTIVE'
                        ? 'border-line text-ok hover:border-alert hover:text-alert'
                        : 'border-danger-line text-alert hover:border-ok hover:text-ok'
                    }`}
                    title={c.status === 'ACTIVE' ? 'Inactivar' : 'Activar'}
                  >
                    <Power className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(c.id)}
                    className="p-1.5 bg-raised border border-line text-alert hover:bg-alert hover:text-white rounded transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ),
            },
          ]}
          rows={paginatedCategories}
          rowKey={(c: any) => c.id}
          rowClassName={(c: any) =>
            `hover:bg-hover transition-colors ${
              c.status === 'INACTIVE' ? 'opacity-60 bg-night-soft' : ''
            }`
          }
          emptyMessage={'[NO HAY CATEGORÍAS REGISTRADAS // UTILICE EL BOTÓN "NUEVA CATEGORÍA"]'}
        />
      </SectionPanel>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredCategories.length}
        itemsPerPage={itemsPerPage}
        onPageChange={(page) => setCurrentPage(page)}
      />

      {/* Modal Crear/Editar */}
      {isModalOpen && (
        <Modal
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={isEditMode ? 'EDITAR CATEGORÍA' : 'NUEVA CATEGORÍA DE PRODUCTO'}
          icon={<Tags className="w-4 h-4" />}
          size="xl"
        >

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <Label className="flex items-center gap-1.5">
                  <Hash className="w-3 h-3" />
                  Nombre *
                </Label>
                <Input
                  type="text"
                  required
                  placeholder="Ej: Tecnología, Despensa, Aseo Personal…"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="font-bold"
                />
                {form.name && (
                  <p className="text-[10px] text-fg-faint mt-1 font-mono">
                    SLUG: {form.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').substring(0, 60)}
                  </p>
                )}
              </div>

              <div>
                <Label className="flex items-center gap-1.5">
                  <FileText className="w-3 h-3" />
                  Descripción
                </Label>
                <TextArea
                  rows={2}
                  placeholder="Descripción opcional de la categoría…"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-input border border-line focus:border-accent p-2.5 rounded text-white resize-none"
                />
              </div>

              <div>
                <Label className="flex items-center gap-1.5 mb-1.5">
                  <Palette className="w-3 h-3" />
                  Color de etiqueta
                </Label>
                <div className="flex items-center gap-2 flex-wrap">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, color: c })}
                      className={`w-9 h-9 rounded border-2 transition-all ${
                        form.color === c ? 'border-white scale-110' : 'border-line hover:border-fg'
                      }`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="w-9 h-9 rounded bg-transparent border border-line cursor-pointer"
                    title="Color personalizado"
                  />
                  <span className="text-[10px] text-fg-muted font-mono">{form.color}</span>
                </div>
              </div>

              {formError && (
                <div className="bg-alert-dim border border-alert-line text-danger p-2.5 rounded font-bold">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-line-dim">
                <TacticalButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                  disabled={saving}
                >
                  CANCELAR
                </TacticalButton>
                <TacticalButton type="submit" variant="primary" size="sm" loading={saving}>
                  {isEditMode ? 'GUARDAR CAMBIOS' : 'CREAR CATEGORÍA'}
                </TacticalButton>
              </div>
            </form>
        </Modal>
      )}

      {/* Modal Confirmar Eliminación */}
      {deleteConfirmId && (
        <Modal
          open={!!deleteConfirmId}
          onClose={() => {
            setDeleteConfirmId(null)
            setReassignTo('')
          }}
          title="CONFIRMAR ELIMINACIÓN"
          icon={<Trash2 className="w-4 h-4" />}
          tone="danger"
          size="md"
        >
            <p className="text-xs text-fg">
              ¿Eliminar esta categoría?
            </p>
            <div>
              <Label>Si tiene productos, reasignar a:</Label>
              <Select
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
                className="p-2 text-xs font-normal"
              >
                <option value="">— Sin categoría —</option>
                {categories
                  .filter((c) => c.id !== deleteConfirmId && c.status === 'ACTIVE')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </Select>
              <p className="text-[10px] text-fg-faint mt-1">
                Los productos vinculados se moverán a esta categoría.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <TacticalButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDeleteConfirmId(null)
                  setReassignTo('')
                }}
              >
                CANCELAR
              </TacticalButton>
              <TacticalButton
                variant="danger"
                size="sm"
                onClick={() => handleDelete(deleteConfirmId)}
              >
                ELIMINAR
              </TacticalButton>
            </div>
        </Modal>
      )}
    </div>
  )
}
