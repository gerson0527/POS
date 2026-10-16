'use client'

import { useState, useEffect } from 'react'
import {
  UserCheck,
  UserPlus,
  RefreshCw,
  CheckCircle2,
  Mail,
  Phone,
  Pencil,
  Power,
  Trash2,
  Wallet,
  AlertTriangle,
  Clock,
  TrendingUp,
  Banknote } from 'lucide-react'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Pagination } from '@/components/tactical/Pagination'
import { Modal } from '@/components/ui/Modal'
import { NumberPromptModal } from '@/components/ui/NumberPromptModal'
import { DataTable } from '@/components/ui/DataTable'
import { MetricCard } from '@/components/tactical/MetricCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select } from '@/components/ui/Select'
import { CustomerFormModal } from '@/components/customers/CustomerFormModal'
import { useToast } from '@/components/ui/ToastProvider'
import { formatCOP } from '@/lib/utils/pos-utils'
import { DOC_TYPES, TAX_REGIMES } from '@/lib/catalogs/customers'
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  toggleCustomerStatus,
  deleteCustomer,
  getCustomerCreditDetail,
  setCustomerCreditLimit,
  payCustomerCredit,
  setCustomerCreditStatus,
  getOverdueCustomers } from '@/app/actions/pos-actions'

const EMPTY_FORM = {
  documentType: 'CC',
  documentNumber: '',
  personType: 'NATURAL',
  name: '',
  tradeName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  department: '',
  taxRegime: '',
  notes: '',
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [overdueCustomers, setOverdueCustomers] = useState<any[]>([])
  const [viewMode, setViewMode] = useState<'all' | 'credit' | 'overdue'>('all')
  const [creditDetailId, setCreditDetailId] = useState<string | null>(null)
  const [creditDetail, setCreditDetail] = useState<any>(null)
  const [loadingCredit, setLoadingCredit] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [docTypeFilter, setDocTypeFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const { toast } = useToast()

  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 8

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<any>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Modal propio (centrado) en reemplazo de los prompt() nativos del navegador.
  const [amountPrompt, setAmountPrompt] = useState<{
    title: string
    description?: string
    label: string
    defaultValue: string
    hint?: string
    confirmLabel: string
    onConfirm: (amount: number) => void
  } | null>(null)

  useEffect(() => {
    loadCustomers()
  }, [])

  async function loadCustomers() {
    setLoading(true)
    try {
      const [data, overdue] = await Promise.all([
        getCustomers(true),
        getOverdueCustomers().catch(() => []),
      ])
      setCustomers(data || [])
      setOverdueCustomers(overdue || [])
    } catch (error) {
      console.error('Error al cargar clientes:', error)
    } finally {
      setLoading(false)
    }
  }

  async function openCreditDetail(customerId: string) {
    setCreditDetailId(customerId)
    setLoadingCredit(true)
    setCreditDetail(null)
    try {
      const detail = await getCustomerCreditDetail(customerId)
      setCreditDetail(detail)
    } catch (err) {
      console.error('Error loading credit detail:', err)
    } finally {
      setLoadingCredit(false)
    }
  }

  async function handleSetCreditLimit(customerId: string, limit: number) {
    try {
      await setCustomerCreditLimit(customerId, limit)
      toast(limit > 0 ? `Cupo de crédito asignado: ${formatCOP(limit)}` : 'Crédito deshabilitado')
      loadCustomers()
      if (creditDetailId === customerId) openCreditDetail(customerId)
    } catch (err: any) {
      toast(`Error: ${err.message}`, 'error')
    }
  }

  async function handlePayCredit(customerId: string, amount: number) {
    try {
      const res = await payCustomerCredit({ customerId, amount, paymentMethod: 'CASH' })
      toast(`Abono registrado: ${formatCOP(res.settled)}`)
      loadCustomers()
      openCreditDetail(customerId)
    } catch (err: any) {
      toast(`Error: ${err.message}`, 'error')
    }
  }

  async function handleToggleBlock(customerId: string, currentStatus: string) {
    try {
      const next = currentStatus === 'BLOQUEADO' ? 'AL_DIA' : 'BLOQUEADO'
      await setCustomerCreditStatus(customerId, next)
      loadCustomers()
      if (creditDetailId === customerId) openCreditDetail(customerId)
    } catch (err: any) {
      toast(`Error: ${err.message}`, 'error')
    }
  }

  function openCreateModal() {
    setForm(EMPTY_FORM)
    setIsEditMode(false)
    setEditingId(null)
    setFormError(null)
    setIsModalOpen(true)
  }

  function openEditModal(customer: any) {
    setForm({
      documentType: customer.documentType || 'CC',
      documentNumber: customer.documentNumber || '',
      personType: customer.personType || 'NATURAL',
      name: customer.name || '',
      tradeName: customer.tradeName || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      city: customer.city || '',
      department: customer.department || '',
      taxRegime: customer.taxRegime || '',
      notes: customer.notes || '',
    })
    setIsEditMode(true)
    setEditingId(customer.id)
    setFormError(null)
    setIsModalOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name?.trim() || !form.documentNumber?.trim()) {
      setFormError('Documento y Nombre son obligatorios.')
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      if (isEditMode && editingId) {
        await updateCustomer(editingId, form)
        toast(`¡CLIENTE "${form.name.toUpperCase()}" ACTUALIZADO!`)
      } else {
        await createCustomer(form)
        toast(`¡CLIENTE "${form.name.toUpperCase()}" REGISTRADO!`)
      }
      setIsModalOpen(false)
      setForm(EMPTY_FORM)
      setEditingId(null)
      setIsEditMode(false)
      loadCustomers()
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar cliente')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleStatus(customer: any) {
    try {
      await toggleCustomerStatus(customer.id)
      toast(`CLIENTE "${customer.name.toUpperCase()}" ${customer.status === 'ACTIVE' ? 'INACTIVADO' : 'ACTIVADO'}`)
      loadCustomers()
    } catch (err: any) {
      toast(`Error: ${err.message}`, 'error')
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteCustomer(id)
      toast('CLIENTE ELIMINADO')
      setDeleteConfirmId(null)
      loadCustomers()
    } catch (err: any) {
      toast(`Error: ${err.message}`, 'error')
    }
  }

  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.toLowerCase()
    const matchSearch =
      !q ||
      c.name?.toLowerCase().includes(q) ||
      c.documentNumber?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q)
    const matchDoc = docTypeFilter === 'ALL' || c.documentType === docTypeFilter
    const matchStatus = statusFilter === 'ALL' || c.status === statusFilter
    const matchView =
      viewMode === 'all' ||
      (viewMode === 'credit' && c.creditEnabled === 'SI') ||
      (viewMode === 'overdue' && overdueCustomers.some((o) => o.id === c.id))
    return matchSearch && matchDoc && matchStatus && matchView
  })

  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage) || 1
  const paginatedCustomers = filteredCustomers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const stats = {
    total: customers.length,
    active: customers.filter((c) => c.status === 'ACTIVE').length,
    inactive: customers.filter((c) => c.status === 'INACTIVE').length,
    businesses: customers.filter((c) => c.personType === 'JURIDICA').length,
    withCredit: customers.filter((c) => c.creditEnabled === 'SI').length,
    overdueCount: overdueCustomers.length,
    totalOutstanding: customers.reduce((acc, c) => acc + Number(c.creditBalance || 0), 0),
  }

  return (
    <div className="space-y-6 font-mono">
      {/* Header Banner */}
      <PageHeader
        icon={<UserCheck className="w-4 h-4" />}
        kicker="CLIENT RELATIONS (CRM) // DIAN-READY"
        title="GESTIÓN DE CLIENTES Y FACTURACIÓN ELECTRÓNICA"
        description="Base de datos de compradores, personas naturales y jurídicas, con datos fiscales para facturación electrónica DIAN."
        actions={
          <>
            <TacticalButton
              variant="secondary"
              size="sm"
              onClick={loadCustomers}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
            >
              RECARGAR
            </TacticalButton>
            <TacticalButton
              variant="primary"
              size="sm"
              onClick={openCreateModal}
              icon={<UserPlus className="w-3.5 h-3.5" />}
            >
              NUEVO CLIENTE
            </TacticalButton>
          </>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard title="TOTAL REGISTRADOS" value={stats.total} icon={<UserCheck className="w-4 h-4" />} accentColor="neutral" accentValue />
        <MetricCard title="ACTIVOS" value={stats.active} icon={<CheckCircle2 className="w-4 h-4" />} accentColor="green" accentValue />
        <MetricCard title="CON CRÉDITO" value={stats.withCredit} icon={<Wallet className="w-4 h-4" />} accentColor="orange" accentValue />
        <MetricCard
          title="EN MORA"
          value={stats.overdueCount}
          icon={<AlertTriangle className="w-4 h-4" />}
          accentColor={stats.overdueCount > 0 ? 'red' : 'neutral'}
          accentValue
        />
        <MetricCard
          title="CARTERA TOTAL"
          value={formatCOP(stats.totalOutstanding)}
          icon={<TrendingUp className="w-4 h-4" />}
          accentColor="orange"
          accentValue
        />
      </div>

      {/* View Mode Tabs */}
      <div className="flex items-center gap-1 border-b border-line">
        {[
          { id: 'all', label: 'TODOS', icon: UserCheck, count: stats.total },
          { id: 'credit', label: 'CON CRÉDITO', icon: Wallet, count: stats.withCredit },
          { id: 'overdue', label: 'EN MORA', icon: AlertTriangle, count: stats.overdueCount, danger: true },
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = viewMode === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => {
                setViewMode(tab.id as any)
                setCurrentPage(1)
              }}
              className={`flex items-center gap-2 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${
                isActive
                  ? tab.danger
                    ? 'border-alert text-alert'
                    : 'border-accent text-accent'
                  : 'border-transparent text-fg-muted hover:text-fg'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${isActive ? (tab.danger ? 'bg-alert/20 text-alert' : 'bg-accent/20 text-accent') : 'bg-line-soft text-fg-muted'}`}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <SearchInput
          placeholder="BUSCAR POR NOMBRE, DOCUMENTO, EMAIL O TELÉFONO..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setCurrentPage(1)
          }}
          wrapperClassName="flex-1"
        />
        <Select
          value={docTypeFilter}
          onChange={(e) => {
            setDocTypeFilter(e.target.value)
            setCurrentPage(1)
          }}
          className="bg-surface px-3 py-2 text-xs uppercase outline-none font-normal"
        >
          <option value="ALL">Todos los documentos</option>
          {DOC_TYPES.map((d) => (
            <option key={d.code} value={d.code}>
              {d.code}
            </option>
          ))}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as any)
            setCurrentPage(1)
          }}
          className="bg-surface px-3 py-2 text-xs uppercase outline-none font-normal"
        >
          <option value="ALL">Todos los estados</option>
          <option value="ACTIVE">Activos</option>
          <option value="INACTIVE">Inactivos</option>
        </Select>
      </div>

      {/* Customers Table */}
      <SectionPanel
        title="DIRECTORIO DE CLIENTES"
        subtitle={`${filteredCustomers.length} REGISTRO(S) · PÁGINA ${currentPage} DE ${totalPages}`}
        noPadding
      >
        <DataTable
          columns={[
            {
              key: 'document',
              header: 'Documento',
              render: (c: any) => (
                <div className="flex flex-col">
                  <span className="text-[10px] text-fg-muted font-bold">{c.documentType}</span>
                  <span className="font-bold text-accent">{c.documentNumber}</span>
                  <span className="text-[10px] text-fg-muted">
                    {c.personType === 'JURIDICA' ? '🏢 JURÍDICA' : '👤 NATURAL'}
                  </span>
                </div>
              ),
            },
            {
              key: 'customer',
              header: 'Cliente',
              render: (c: any) => (
                <div className="flex flex-col">
                  <span className="font-semibold text-fg">{c.name}</span>
                  {c.tradeName && (
                    <span className="text-[10px] text-fg-muted">"{c.tradeName}"</span>
                  )}
                </div>
              ),
            },
            {
              key: 'contact',
              header: 'Contacto',
              render: (c: any) => (
                <div className="flex flex-col gap-0.5 text-fg-muted">
                  {c.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {c.email}
                    </span>
                  )}
                  {c.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {c.phone}
                    </span>
                  )}
                  {!c.email && !c.phone && <span className="text-fg-faint">—</span>}
                </div>
              ),
            },
            {
              key: 'location',
              header: 'Ubicación',
              cellClassName: 'text-fg-muted',
              render: (c: any) => (
                <div className="flex flex-col">
                  {c.city && <span className="font-bold text-fg">{c.city}</span>}
                  {c.department && <span className="text-[10px]">{c.department}</span>}
                  {c.address && !c.city && <span className="text-[10px] truncate max-w-[200px]">{c.address}</span>}
                  {!c.city && !c.department && !c.address && <span className="text-fg-faint">—</span>}
                </div>
              ),
            },
            {
              key: 'taxRegime',
              header: 'Régimen',
              cellClassName: 'text-fg',
              render: (c: any) =>
                c.taxRegime ? (
                  TAX_REGIMES.find((r) => r.code === c.taxRegime)?.label || c.taxRegime
                ) : (
                  <span className="text-fg-faint">—</span>
                ),
            },
            {
              key: 'credit',
              header: 'Crédito',
              render: (c: any) =>
                c.creditEnabled === 'SI' ? (
                  <button
                    onClick={() => openCreditDetail(c.id)}
                    className="flex flex-col items-start gap-0.5 hover:opacity-80 text-left"
                  >
                    <span className={`text-[10px] font-bold uppercase ${
                      c.creditStatus === 'EN_MORA' ? 'text-alert' :
                      c.creditStatus === 'BLOQUEADO' ? 'text-warning' :
                      'text-ok'
                    }`}>
                      {c.creditStatus === 'EN_MORA' && '⚠ MORA'}
                      {c.creditStatus === 'BLOQUEADO' && '🔒 BLOQUEADO'}
                      {c.creditStatus === 'AL_DIA' && '✓ AL DÍA'}
                    </span>
                    <span className="text-[11px] text-fg font-bold">{formatCOP(Number(c.creditBalance || 0))}</span>
                    <span className="text-[10px] text-fg-muted">de {formatCOP(Number(c.creditLimit || 0))}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setAmountPrompt({
                        title: 'ASIGNAR CRÉDITO',
                        description: `Defina el cupo de crédito a favor de ${c.name}.`,
                        label: 'CUPO DE CRÉDITO (COP)',
                        defaultValue: '100000',
                        hint: 'Ingrese 0 para deshabilitar el crédito.',
                        confirmLabel: 'ASIGNAR CRÉDITO',
                        onConfirm: (limit) => handleSetCreditLimit(c.id, limit),
                      })
                    }}
                    className="px-2 py-1 bg-raised border border-dashed border-line text-fg-muted hover:border-accent hover:text-accent rounded text-[10px] font-bold uppercase"
                  >
                    + Asignar Crédito
                  </button>
                ),
            },
            {
              key: 'status',
              header: 'Estado',
              render: (c: any) => (
                <StatusBadge
                  status={c.status === 'ACTIVE' ? 'online' : 'critical'}
                  label={c.status === 'ACTIVE' ? 'ACTIVO' : 'INACTIVO'}
                />
              ),
            },
            {
              key: 'actions',
              header: 'Acciones',
              align: 'right',
              render: (c: any) => (
                <div className="flex items-center justify-end gap-1.5">
                  {c.creditEnabled === 'SI' && (
                    <button
                      onClick={() => openCreditDetail(c.id)}
                      className="p-1.5 bg-raised border border-line text-ok hover:border-ok hover:bg-ok/10 rounded transition-colors"
                      title="Ver Crédito"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => openEditModal(c)}
                    className="p-1.5 bg-raised border border-line text-fg hover:border-accent hover:text-accent rounded transition-colors"
                    title="Editar Cliente"
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
                    title={c.status === 'ACTIVE' ? 'Inactivar Cliente' : 'Activar Cliente'}
                  >
                    <Power className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(c.id)}
                    className="p-1.5 bg-raised border border-line text-alert hover:bg-alert hover:text-white rounded transition-colors"
                    title="Eliminar Cliente"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ),
            },
          ]}
          rows={paginatedCustomers}
          rowKey={(c: any) => c.id}
          rowClassName={(c: any) => `hover:bg-hover transition-colors ${c.status === 'INACTIVE' ? 'opacity-60 bg-night-soft' : ''}`}
          emptyMessage={'[NO HAY CLIENTES REGISTRADOS // UTILICE EL BOTÓN "NUEVO CLIENTE"]'}
        />
      </SectionPanel>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredCustomers.length}
        itemsPerPage={itemsPerPage}
        onPageChange={(page) => setCurrentPage(page)}
      />

      {/* Create/Edit Modal */}
      <CustomerFormModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        isEditMode={isEditMode}
        onSubmit={handleSubmit}
        form={form}
        onChange={setForm}
        docTypes={DOC_TYPES}
        taxRegimes={TAX_REGIMES}
        saving={saving}
        error={formError}
        onCancel={() => setIsModalOpen(false)}
      />

      {/* Delete Confirmation */}
      {deleteConfirmId && (
        <Modal
          open={!!deleteConfirmId}
          onClose={() => setDeleteConfirmId(null)}
          title="CONFIRMAR ELIMINACIÓN"
          icon={<Trash2 className="w-4 h-4" />}
          tone="danger"
          size="md"
        >
            <p className="text-xs text-fg">
              ¿Estás seguro de eliminar este cliente? <strong className="text-accent">Esta acción no se puede deshacer.</strong>
            </p>
            <p className="text-[10px] text-fg-muted">
              Nota: Si el cliente tiene ventas asociadas, no se podrá eliminar. Solo inactivar.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <TacticalButton
                variant="secondary"
                size="sm"
                onClick={() => setDeleteConfirmId(null)}
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

      {/* MODAL NUMÉRICO (cupo / abono) — reemplaza los prompt() nativos */}
      {amountPrompt && (
        <NumberPromptModal
          open
          onClose={() => setAmountPrompt(null)}
          title={amountPrompt.title}
          icon={<Wallet className="w-4 h-4" />}
          description={amountPrompt.description}
          label={amountPrompt.label}
          defaultValue={amountPrompt.defaultValue}
          hint={amountPrompt.hint}
          confirmLabel={amountPrompt.confirmLabel}
          onConfirm={amountPrompt.onConfirm}
        />
      )}

      {/* Credit Detail Modal */}
      {creditDetailId && (
        <Modal
          open={!!creditDetailId}
          onClose={() => {
            setCreditDetailId(null)
            setCreditDetail(null)
          }}
          title={creditDetail ? `CUENTA CORRIENTE — ${creditDetail.customer.name}` : undefined}
          icon={creditDetail ? <Wallet className="w-4 h-4" /> : undefined}
          size="3xl"
        >
            {loadingCredit ? (
              <div className="py-12 text-center text-fg-muted">Cargando...</div>
            ) : creditDetail ? (
              <>
                {/* Credit Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-input border border-line rounded p-3">
                    <div className="text-[10px] text-fg-muted uppercase font-bold">Cupo Asignado</div>
                    <div className="text-lg font-bold text-accent mt-1">{formatCOP(Number(creditDetail.customer.creditLimit))}</div>
                  </div>
                  <div className="bg-input border border-line rounded p-3">
                    <div className="text-[10px] text-fg-muted uppercase font-bold">Saldo Actual</div>
                    <div className={`text-lg font-bold mt-1 ${Number(creditDetail.customer.creditBalance) > 0 ? 'text-alert' : 'text-ok'}`}>
                      {formatCOP(Number(creditDetail.customer.creditBalance))}
                    </div>
                  </div>
                  <div className="bg-input border border-line rounded p-3">
                    <div className="text-[10px] text-fg-muted uppercase font-bold">Disponible</div>
                    <div className="text-lg font-bold text-ok mt-1">{formatCOP(creditDetail.available)}</div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      const amountStr = prompt('Monto del abono (COP):', '')
                      if (amountStr) {
                        const amount = parseInt(amountStr) || 0
                        if (amount > 0) handlePayCredit(creditDetailId, amount)
                      }
                    }}
                    disabled={Number(creditDetail.customer.creditBalance) === 0}
                    className="px-3 py-2.5 bg-ok text-white font-bold uppercase text-xs rounded hover:bg-ok-strong disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    Registrar Abono
                  </button>
                  <button
                    onClick={() => handleToggleBlock(creditDetailId, creditDetail.customer.creditStatus)}
                    className={`px-3 py-2.5 font-bold uppercase text-xs rounded flex items-center justify-center gap-1 ${
                      creditDetail.customer.creditStatus === 'BLOQUEADO'
                        ? 'bg-ok text-white hover:bg-ok-strong'
                        : 'bg-warning text-white hover:bg-warn-soft'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    {creditDetail.customer.creditStatus === 'BLOQUEADO' ? 'Desbloquear' : 'Bloquear'}
                  </button>
                  <button
                    onClick={() => {
                      setAmountPrompt({
                        title: 'MODIFICAR CUPO',
                        description: `Ajuste el cupo de crédito de ${creditDetail.customer.name}.`,
                        label: 'NUEVO CUPO DE CRÉDITO (COP)',
                        defaultValue: String(creditDetail.customer.creditLimit),
                        hint: 'Ingrese 0 para deshabilitar el crédito.',
                        confirmLabel: 'GUARDAR CUPO',
                        onConfirm: (limit) => handleSetCreditLimit(creditDetailId, limit),
                      })
                    }}
                    className="px-3 py-2.5 bg-raised border border-line text-fg hover:border-accent font-bold uppercase text-xs rounded flex items-center justify-center gap-1"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Modificar Cupo
                  </button>
                </div>

                {/* Transaction History */}
                <div>
                  <div className="text-[10px] text-fg-muted uppercase tracking-widest font-bold mb-2 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-accent" />
                    Historial de Movimientos
                  </div>
                  <DataTable
                    columns={[
                      {
                        key: 'createdAt',
                        header: 'Fecha',
                        cellClassName: 'text-fg-muted',
                        render: (tx: any) => new Date(tx.createdAt).toLocaleString(),
                      },
                      {
                        key: 'type',
                        header: 'Tipo',
                        render: (tx: any) => (
                          <>
                            {tx.type === 'CHARGE' ? (
                              <span className="text-alert font-bold">↑ CARGO</span>
                            ) : (
                              <span className="text-ok font-bold">↓ ABONO</span>
                            )}
                            {tx.note && <span className="text-fg-faint ml-1.5">— {tx.note}</span>}
                          </>
                        ),
                      },
                      {
                        key: 'amount',
                        header: 'Monto',
                        align: 'right',
                        cellClassName: 'font-bold',
                        render: (tx: any) => (
                          <span className={tx.type === 'CHARGE' ? 'text-alert' : 'text-ok'}>
                            {tx.type === 'CHARGE' ? '+' : '-'}{formatCOP(Number(tx.amount))}
                          </span>
                        ),
                      },
                      {
                        key: 'balanceAfter',
                        header: 'Saldo',
                        align: 'right',
                        cellClassName: 'text-fg font-bold',
                        render: (tx: any) => formatCOP(Number(tx.balanceAfter)),
                      },
                      {
                        key: 'dueDate',
                        header: 'Vence',
                        cellClassName: 'text-fg-muted',
                        render: (tx: any) => (tx.dueDate ? new Date(tx.dueDate).toLocaleDateString() : '—'),
                      },
                      {
                        key: 'status',
                        header: 'Estado',
                        render: (tx: any) => (
                          <>
                            {tx.status === 'PAGADO' && <span className="text-ok font-bold">✓ PAGADO</span>}
                            {tx.status === 'PENDIENTE' && <span className="text-warning font-bold">⏳ PENDIENTE</span>}
                            {tx.status === 'VENCIDO' && <span className="text-alert font-bold">⚠ VENCIDO</span>}
                          </>
                        ),
                      },
                    ]}
                    rows={creditDetail.transactions}
                    rowKey={(tx: any) => tx.id}
                    emptyMessage="Sin movimientos aún"
                    rowClassName="hover:bg-ash"
                    tableClassName="w-full text-xs"
                    theadClassName="bg-surface border-b border-line text-fg-muted sticky top-0"
                    wrapperClassName="border border-line rounded max-h-72 overflow-y-auto"
                  />
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-alert">Error al cargar crédito</div>
            )}
        </Modal>
      )}
    </div>
  )
}
