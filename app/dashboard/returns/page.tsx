'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Eye,
  PackageCheck,
  Printer,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  Undo2,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { MetricCard } from '@/components/tactical/MetricCard'
import { Pagination } from '@/components/tactical/Pagination'
import { StatusBadge } from '@/components/tactical/StatusBadge'
import { Modal } from '@/components/ui/Modal'
import { DataTable } from '@/components/ui/DataTable'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { TextArea } from '@/components/ui/TextArea'
import { SearchInput } from '@/components/ui/SearchInput'
import { ReturnTicketModal } from '@/components/returns/ReturnTicketModal'
import type { CustomerReturnDetail } from '@/lib/returns/service'
import { useToast } from '@/components/ui/ToastProvider'
import { calculateReturn } from '@/lib/returns/calculate'
import { RETURN_REASON_OTHER, RETURN_REASONS } from '@/lib/returns/constants'
import type { ReturnableSale } from '@/lib/returns/service'
import {
  createCustomerReturn,
  getReturnDetail,
  getReturnsList,
  getSaleForReturn,
  searchSalesForReturn,
} from '@/app/actions/returns'

const PAGE_SIZE = 10

function saleDocumentLabel(sale: {
  invoiceNumber?: string | null
  ticketNumber?: number | null
}): string {
  if (sale.invoiceNumber) return `FACTURA ${sale.invoiceNumber}`
  if (sale.ticketNumber) return `TICKET #${sale.ticketNumber}`
  return 'VENTA'
}

function isToday(value: string | null | undefined): boolean {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return date.toLocaleDateString('sv-SE') === new Date().toLocaleDateString('sv-SE')
}

export default function ReturnsPage() {
  const { toast } = useToast()

  const [returns, setReturns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const [newReturnOpen, setNewReturnOpen] = useState(false)
  const [saleQuery, setSaleQuery] = useState('')
  const [saleSearchFeedback, setSaleSearchFeedback] = useState<string | null>(null)
  const [searchingSales, setSearchingSales] = useState(false)
  const [selectedSale, setSelectedSale] = useState<ReturnableSale | null>(null)
  const [loadingSale, setLoadingSale] = useState(false)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [reasonDetail, setReasonDetail] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const [detail, setDetail] = useState<any | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [ticket, setTicket] = useState<CustomerReturnDetail | null>(null)

  useEffect(() => {
    loadReturns()
  }, [])

  async function loadReturns() {
    setLoading(true)
    try {
      const data = await getReturnsList()
      setReturns(data || [])
    } catch (err: any) {
      toast(`Error al cargar devoluciones: ${err?.message || 'conexión fallida'}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  function resetNewReturn() {
    setSaleQuery('')
    setSaleSearchFeedback(null)
    setSelectedSale(null)
    setQuantities({})
    setReason('')
    setReasonDetail('')
    setNotes('')
    setSaving(false)
  }

  async function openNewReturn() {
    resetNewReturn()
    setNewReturnOpen(true)
  }

  async function runSaleSearch(term: string) {
    const query = term.trim()
    if (!query) {
      setSaleSearchFeedback('Escriba nombre, documento o número de factura y pulse Buscar.')
      return
    }

    setSearchingSales(true)
    setSaleSearchFeedback(null)
    try {
      const results = await searchSalesForReturn(query)
      if (!results?.length) {
        setSaleSearchFeedback('No se encontraron ventas completadas con ese criterio.')
        return
      }

      const available = results.filter((sale) => !sale.isFullyReturned)
      if (available.length === 0) {
        setSaleSearchFeedback('Las ventas encontradas ya tienen todos los productos devueltos.')
        return
      }

      if (available.length === 1) {
        await selectSale(available[0].id)
        return
      }

      toast(
        `Se encontraron ${available.length} ventas. Especifique el número de factura o ticket.`,
        'info'
      )
    } catch (err: any) {
      toast(`Error al buscar ventas: ${err?.message || 'conexión fallida'}`, 'error')
    } finally {
      setSearchingSales(false)
    }
  }

  async function selectSale(saleId: string) {
    setLoadingSale(true)
    setSelectedSale(null)
    setQuantities({})
    try {
      const sale = await getSaleForReturn(saleId)
      setSelectedSale(sale)
    } catch (err: any) {
      toast(`Error al cargar la venta: ${err?.message || 'conexión fallida'}`, 'error')
    } finally {
      setLoadingSale(false)
    }
  }

  function setItemQuantity(saleItemId: string, value: string) {
    setQuantities((current) => ({ ...current, [saleItemId]: value }))
  }

  function fillAllRemaining() {
    if (!selectedSale) return
    const next: Record<string, string> = {}
    selectedSale.items.forEach((item) => {
      if (item.remainingQuantity > 0) next[item.id] = String(item.remainingQuantity)
    })
    setQuantities(next)
  }

  const preview = useMemo(() => {
    if (!selectedSale) return { data: null, error: null as string | null }
    const requested = Object.entries(quantities)
      .map(([saleItemId, value]) => ({ saleItemId, quantity: Number(value) }))
      .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0)

    if (!requested.length) return { data: null, error: null as string | null }

    try {
      return {
        data: calculateReturn({
          saleTotal: selectedSale.total,
          saleItems: selectedSale.items,
          requestedItems: requested,
          alreadyReturned: selectedSale.items.map((item) => ({
            saleItemId: item.id,
            quantity: item.returnedQuantity,
          })),
          previousReturnTotal: selectedSale.returnedTotal,
        }),
        error: null as string | null,
      }
    } catch (err: any) {
      return { data: null, error: err?.message || 'Cantidades inválidas.' }
    }
  }, [selectedSale, quantities])

  const selectedUnits = useMemo(
    () =>
      Object.values(quantities).reduce((sum, value) => {
        const quantity = Number(value)
        return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0)
      }, 0),
    [quantities]
  )

  async function openTicket(returnId: string) {
    try {
      const data = await getReturnDetail(returnId)
      setTicket(data)
    } catch (err: any) {
      toast(`Error al generar el ticket: ${err?.message || 'conexión fallida'}`, 'error')
    }
  }

  async function openDetail(returnId: string) {
    setLoadingDetail(true)
    setDetail(null)
    try {
      const data = await getReturnDetail(returnId)
      setDetail(data)
    } catch (err: any) {
      toast(`Error al cargar la devolución: ${err?.message || 'conexión fallida'}`, 'error')
    } finally {
      setLoadingDetail(false)
    }
  }

  function resolvedReason(): string | null {
    if (!reason) return null
    if (reason === RETURN_REASON_OTHER) {
      const detail = reasonDetail.trim()
      if (detail.length < 5) return null
      return `Otro: ${detail}`
    }
    return reason
  }

  async function submitReturn() {
    if (!selectedSale || !preview.data) return

    const reasonText = resolvedReason()
    if (!reasonText) {
      toast(
        reason === RETURN_REASON_OTHER
          ? 'Describa el motivo (mínimo 5 caracteres).'
          : 'Seleccione el motivo de la devolución.',
        'error'
      )
      return
    }

    setSaving(true)
    try {
      const res = await createCustomerReturn({
        saleId: selectedSale.id,
        items: preview.data.lines.map((line) => ({
          saleItemId: line.saleItemId,
          quantity: line.quantity,
        })),
        refundMethod: 'NONE',
        reason: reasonText,
        notes: notes.trim() || undefined,
      })

      if (!res.success) {
        toast(res.message, 'error')
        return
      }

      toast(
        `${res.returnNumberLabel} registrada · ${selectedUnits} unidad(es) devueltas al inventario`
      )
      const returnId = res.returnId
      setNewReturnOpen(false)
      resetNewReturn()
      loadReturns()
      if (returnId) await openTicket(returnId)
    } catch (err: any) {
      toast(`Error al registrar la devolución: ${err?.message || 'conexión fallida'}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const filteredReturns = returns.filter((row) => {
    const term = search.trim().toLowerCase()
    const matchSearch =
      !term ||
      row.returnNumberLabel?.toLowerCase().includes(term) ||
      String(row.saleTicketNumber || '').includes(term) ||
      row.customerName?.toLowerCase().includes(term) ||
      row.customerDocNumber?.toLowerCase().includes(term) ||
      row.reason?.toLowerCase().includes(term) ||
      row.userName?.toLowerCase().includes(term)

    let matchDate = true
    if (row.createdAt) {
      const created = new Date(row.createdAt)
      if (dateFrom && created < new Date(`${dateFrom}T00:00:00`)) matchDate = false
      if (matchDate && dateTo && created > new Date(`${dateTo}T23:59:59.999`)) matchDate = false
    }

    return matchSearch && matchDate
  })

  const totalPages = Math.ceil(filteredReturns.length / PAGE_SIZE) || 1
  const safePage = Math.min(currentPage, totalPages)
  const paginatedReturns = filteredReturns.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  )

  const stats = {
    count: returns.length,
    units: returns.reduce((sum, row) => sum + Number(row.unitCount || 0), 0),
    today: returns.filter((row) => isToday(row.createdAt)).length,
    last: returns[0]?.createdAt
      ? new Date(returns[0].createdAt).toLocaleString('es-CO', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—',
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<RotateCcw className="w-4 h-4" />}
        kicker="POST-VENTA // DEVOLUCIÓN DE PRODUCTOS"
        title="DEVOLUCIONES A CLIENTE"
        description="Registre el producto que el cliente devuelve. La factura original no se modifica: solo se devuelve la cantidad al inventario de la sede de la venta."
        actions={
          <>
            <TacticalButton
              variant="secondary"
              size="sm"
              onClick={loadReturns}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
            >
              RECARGAR
            </TacticalButton>
            <TacticalButton
              variant="primary"
              size="sm"
              onClick={openNewReturn}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              NUEVA DEVOLUCIÓN
            </TacticalButton>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          title="DEVOLUCIONES"
          value={stats.count}
          icon={<Undo2 className="w-4 h-4" />}
          accentColor="neutral"
          accentValue
        />
        <MetricCard
          title="UNIDADES DEVUELTAS"
          value={stats.units}
          icon={<Boxes className="w-4 h-4" />}
          accentColor="orange"
          accentValue
        />
        <MetricCard
          title="DEVOLUCIONES HOY"
          value={stats.today}
          icon={<CalendarClock className="w-4 h-4" />}
          accentColor="green"
          accentValue
        />
        <MetricCard
          title="ÚLTIMA DEVOLUCIÓN"
          value={stats.last}
          icon={<PackageCheck className="w-4 h-4" />}
          accentColor="blue"
          accentValue
        />
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <SearchInput
          placeholder="BUSCAR POR DEVOLUCIÓN, TICKET, CLIENTE, DOCUMENTO O MOTIVO..."
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setCurrentPage(1)
          }}
          wrapperClassName="flex-1"
        />
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value)
              setCurrentPage(1)
            }}
            className="bg-surface px-3 py-2 text-xs"
            aria-label="Desde"
          />
          <span className="text-fg-muted text-xs">→</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(event) => {
              setDateTo(event.target.value)
              setCurrentPage(1)
            }}
            className="bg-surface px-3 py-2 text-xs"
            aria-label="Hasta"
          />
        </div>
      </div>

      <SectionPanel
        title="HISTORIAL DE DEVOLUCIONES"
        subtitle={`${filteredReturns.length} REGISTRO(S) · PÁGINA ${safePage} DE ${totalPages}`}
        noPadding
      >
        <DataTable
          columns={[
            {
              key: 'returnNumber',
              header: 'Devolución',
              render: (row: any) => (
                <div className="flex flex-col">
                  <span className="font-bold text-accent">{row.returnNumberLabel}</span>
                  <span className="text-[10px] text-fg-muted">
                    {row.createdAt ? new Date(row.createdAt).toLocaleString('es-CO') : '—'}
                  </span>
                </div>
              ),
            },
            {
              key: 'sale',
              header: 'Factura / Cliente',
              render: (row: any) => (
                <div className="flex flex-col">
                  <span className="font-bold text-fg">
                    {row.saleTicketNumber ? `VENTA #${row.saleTicketNumber}` : 'VENTA'}
                  </span>
                  <span className="text-[10px] text-fg-muted truncate max-w-[200px]">
                    {row.customerName || 'CONSUMIDOR FINAL'}
                    {row.customerDocNumber ? ` · ${row.customerDocNumber}` : ''}
                  </span>
                </div>
              ),
            },
            {
              key: 'items',
              header: 'Devuelto',
              align: 'center',
              render: (row: any) => (
                <span className="inline-flex items-center gap-1 text-fg-muted">
                  <PackageCheck className="w-3.5 h-3.5" />
                  {row.unitCount ?? 0} und · {row.itemCount ?? 0} prod.
                </span>
              ),
            },
            {
              key: 'reason',
              header: 'Motivo',
              cellClassName: 'text-fg-muted max-w-[260px] truncate',
              render: (row: any) => row.reason,
            },
            {
              key: 'user',
              header: 'Operador',
              cellClassName: 'text-fg-muted',
              render: (row: any) => row.userName || '—',
            },
            {
              key: 'status',
              header: 'Estado',
              render: (row: any) => (
                <StatusBadge
                  status={row.status === 'COMPLETED' ? 'completed' : 'pending'}
                  label={row.status === 'COMPLETED' ? 'REGISTRADA' : row.status}
                />
              ),
            },
            {
              key: 'actions',
              header: 'Acciones',
              align: 'right',
              render: (row: any) => (
                <div className="inline-flex items-center gap-1">
                  <button
                    onClick={() => openTicket(row.id)}
                    className="p-1.5 bg-raised border border-line text-fg hover:border-accent hover:text-accent rounded transition-colors"
                    title="Imprimir ticket"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => openDetail(row.id)}
                    className="p-1.5 bg-raised border border-line text-fg hover:border-accent hover:text-accent rounded transition-colors"
                    title="Ver detalle"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              ),
            },
          ]}
          rows={paginatedReturns}
          rowKey={(row: any) => row.id}
          rowClassName="hover:bg-hover transition-colors"
          emptyMessage="[NO HAY DEVOLUCIONES REGISTRADAS // UTILICE EL BOTÓN NUEVA DEVOLUCIÓN]"
        />
      </SectionPanel>

      <Pagination
        currentPage={safePage}
        totalPages={totalPages}
        totalItems={filteredReturns.length}
        itemsPerPage={PAGE_SIZE}
        onPageChange={setCurrentPage}
      />

      {/* NUEVA DEVOLUCIÓN */}
      <Modal
        open={newReturnOpen}
        onClose={() => {
          if (!saving) setNewReturnOpen(false)
        }}
        title="REGISTRAR DEVOLUCIÓN DE PRODUCTO"
        icon={<RotateCcw className="w-4 h-4" />}
        size="3xl"
      >
        <div className="space-y-4">
          {!selectedSale && (
            <div className="border border-line rounded-lg bg-panel p-4 space-y-3">
              <Label className="text-[10px] uppercase tracking-widest text-fg-muted">
                Buscar cliente o factura
              </Label>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <Input
                  value={saleQuery}
                  onChange={(event) => {
                    setSaleQuery(event.target.value)
                    if (saleSearchFeedback) setSaleSearchFeedback(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') runSaleSearch(saleQuery)
                  }}
                  placeholder="Nombre, cédula/NIT, número de factura o ticket"
                  className="flex-1 min-w-0 h-9 py-2"
                  disabled={searchingSales || loadingSale}
                />
                <TacticalButton
                  variant="secondary"
                  size="md"
                  className="w-full sm:w-auto shrink-0"
                  onClick={() => runSaleSearch(saleQuery)}
                  loading={searchingSales}
                  icon={<Search className="w-3.5 h-3.5" />}
                >
                  BUSCAR
                </TacticalButton>
              </div>
              {searchingSales && (
                <p className="text-xs text-fg-muted">Buscando venta...</p>
              )}
              {saleSearchFeedback && !searchingSales && (
                <p className="text-xs text-fg-muted">{saleSearchFeedback}</p>
              )}
            </div>
          )}

          {loadingSale && (
            <div className="py-6 text-center text-xs text-fg-muted">Cargando factura...</div>
          )}

          {selectedSale && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 bg-panel border border-line rounded p-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-fg">
                    <ReceiptText className="w-4 h-4 text-accent" />
                    {saleDocumentLabel(selectedSale)}
                  </div>
                  <div className="text-[11px] text-fg-muted mt-1">
                    {selectedSale.customerName || 'CONSUMIDOR FINAL'} ·{' '}
                    {selectedSale.customerDocNumber || 'SIN DOCUMENTO'} ·{' '}
                    {selectedSale.locationName || 'SEDE'}
                  </div>
                  <div className="text-[11px] text-fg-muted">
                    {selectedSale.createdAt
                      ? new Date(selectedSale.createdAt).toLocaleString('es-CO')
                      : '—'}
                  </div>
                </div>
                <TacticalButton
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSelectedSale(null)
                    setQuantities({})
                  }}
                >
                  CAMBIAR FACTURA
                </TacticalButton>
              </div>

              {selectedSale.isFullyReturned ? (
                <div className="p-4 border border-warning/40 bg-warning/10 rounded text-xs text-warning flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Todos los productos de esta factura ya fueron devueltos.
                </div>
              ) : (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] uppercase tracking-widest font-bold text-fg-muted">
                        PRODUCTOS DE LA FACTURA
                      </div>
                      <button
                        onClick={fillAllRemaining}
                        className="text-[10px] font-bold uppercase text-accent hover:underline"
                      >
                        Devolver todo lo disponible
                      </button>
                    </div>
                    <div className="border border-line rounded overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-surface text-fg-muted uppercase text-[10px]">
                          <tr>
                            <th className="px-3 py-2 text-left">Producto</th>
                            <th className="px-3 py-2 text-right">Facturado</th>
                            <th className="px-3 py-2 text-right">Ya devuelto</th>
                            <th className="px-3 py-2 text-right">Disponible</th>
                            <th className="px-3 py-2 text-right w-32">A devolver</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {selectedSale.items.map((item) => (
                            <tr
                              key={item.id}
                              className={item.remainingQuantity <= 0 ? 'opacity-50' : ''}
                            >
                              <td className="px-3 py-2">
                                <div className="font-semibold text-fg">
                                  {item.productName || item.productId}
                                </div>
                                <div className="text-[10px] text-fg-muted">{item.sku || '—'}</div>
                              </td>
                              <td className="px-3 py-2 text-right text-fg-muted">{item.quantity}</td>
                              <td className="px-3 py-2 text-right text-fg-muted">
                                {item.returnedQuantity}
                              </td>
                              <td className="px-3 py-2 text-right font-bold text-accent">
                                {item.remainingQuantity}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Input
                                  type="number"
                                  min={0}
                                  max={item.remainingQuantity}
                                  step="1"
                                  value={quantities[item.id] ?? ''}
                                  disabled={item.remainingQuantity <= 0}
                                  onChange={(event) => setItemQuantity(item.id, event.target.value)}
                                  className="px-2 py-1 text-right text-xs"
                                  placeholder="0"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>MOTIVO DE DEVOLUCIÓN</Label>
                      <Select
                        value={reason}
                        onChange={(event) => {
                          const value = event.target.value
                          setReason(value)
                          if (value !== RETURN_REASON_OTHER) setReasonDetail('')
                        }}
                        className="h-11 text-xs"
                      >
                        <option value="">Seleccione un motivo</option>
                        {RETURN_REASONS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                      {reason === RETURN_REASON_OTHER && (
                        <TextArea
                          value={reasonDetail}
                          onChange={(event) => setReasonDetail(event.target.value)}
                          rows={2}
                          maxLength={480}
                          placeholder="Describa el motivo (mínimo 5 caracteres)"
                        />
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>NOTAS INTERNAS (OPCIONAL)</Label>
                      <TextArea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder="Observaciones para auditoría"
                      />
                    </div>
                  </div>

                  {preview.error && (
                    <div className="p-3 border border-alert/40 bg-alert-dim rounded text-xs text-alert flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      {preview.error}
                    </div>
                  )}

                  <div className="bg-input border border-accent/40 rounded p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[10px] uppercase tracking-widest text-fg-muted font-bold">
                      RESUMEN DE LA DEVOLUCIÓN
                    </div>
                    <div className="text-xs text-fg">
                      <strong className="text-accent text-lg">{selectedUnits}</strong> unidad(es)
                      en{' '}
                      <strong className="text-fg">{preview.data?.lines.length || 0}</strong>{' '}
                      producto(s)
                    </div>
                    <div className="text-[10px] text-fg-muted">
                      La factura original no se modifica. Solo se genera la entrada de inventario.
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-line">
                    <TacticalButton
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (!saving) setNewReturnOpen(false)
                      }}
                    >
                      CANCELAR
                    </TacticalButton>
                    <TacticalButton
                      variant="primary"
                      size="sm"
                      onClick={submitReturn}
                      loading={saving}
                      disabled={!preview.data || !!preview.error}
                      icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                    >
                      REGISTRAR DEVOLUCIÓN
                    </TacticalButton>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </Modal>

      {/* DETALLE */}
      <Modal
        open={!!detail || loadingDetail}
        onClose={() => setDetail(null)}
        title={detail ? `DEVOLUCIÓN ${detail.returnNumberLabel}` : 'CARGANDO DEVOLUCIÓN'}
        icon={<RotateCcw className="w-4 h-4" />}
        size="3xl"
        actions={
          detail ? (
            <TacticalButton
              variant="secondary"
              size="sm"
              onClick={() => setTicket(detail)}
              icon={<Printer className="w-3.5 h-3.5" />}
            >
              TICKET
            </TacticalButton>
          ) : null
        }
      >
        {loadingDetail ? (
          <div className="py-12 text-center text-xs text-fg-muted">Cargando...</div>
        ) : detail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-input border border-line rounded p-3">
                <div className="text-[10px] text-fg-muted uppercase font-bold">Factura / Cliente</div>
                <div className="text-sm font-bold text-fg mt-1">
                  {detail.saleTicketNumber ? `#${detail.saleTicketNumber}` : detail.saleId}
                </div>
                <div className="text-[10px] text-fg-muted">
                  {detail.customerName || 'CONSUMIDOR FINAL'} ·{' '}
                  {detail.customerDocNumber || 'SIN DOCUMENTO'}
                </div>
              </div>
              <div className="bg-input border border-line rounded p-3">
                <div className="text-[10px] text-fg-muted uppercase font-bold">Fecha</div>
                <div className="text-sm font-bold text-fg mt-1">
                  {detail.createdAt ? new Date(detail.createdAt).toLocaleString('es-CO') : '—'}
                </div>
                <div className="text-[10px] text-fg-muted">Operador: {detail.userName || '—'}</div>
              </div>
              <div className="bg-input border border-line rounded p-3">
                <div className="text-[10px] text-fg-muted uppercase font-bold">Inventario</div>
                <div className="text-lg font-bold text-ok mt-1">
                  +{detail.unitCount ?? 0} unidad(es)
                </div>
                <div className="text-[10px] text-fg-muted">
                  {detail.items.length} producto(s) · Sede {detail.locationName || detail.locationId}
                </div>
              </div>
            </div>

            <div className="bg-panel border border-line rounded p-3 text-xs">
              <div className="text-[10px] text-fg-muted uppercase font-bold">Motivo</div>
              <div className="text-fg mt-1">{detail.reason}</div>
              {detail.notes && (
                <>
                  <div className="text-[10px] text-fg-muted uppercase font-bold mt-2">Notas</div>
                  <div className="text-fg mt-1">{detail.notes}</div>
                </>
              )}
            </div>

            <div>
              <div className="text-[10px] text-fg-muted uppercase tracking-widest font-bold mb-2">
                PRODUCTOS DEVUELTOS
              </div>
              <DataTable
                columns={[
                  {
                    key: 'product',
                    header: 'Producto',
                    render: (item: any) => (
                      <div className="flex flex-col">
                        <span className="font-semibold text-fg">
                          {item.productName || item.productId}
                        </span>
                        <span className="text-[10px] text-fg-muted">{item.sku || '—'}</span>
                      </div>
                    ),
                  },
                  {
                    key: 'quantity',
                    header: 'Cantidad devuelta',
                    align: 'right',
                    cellClassName: 'font-bold text-ok',
                    render: (item: any) => item.quantity,
                  },
                ]}
                rows={detail.items}
                rowKey={(item: any) => item.id}
                rowClassName="hover:bg-hover"
                tableClassName="w-full text-xs"
                theadClassName="bg-surface border-b border-line text-fg-muted uppercase text-[10px]"
                wrapperClassName="border border-line rounded overflow-x-auto"
                emptyMessage="Sin ítems"
              />
            </div>

            <div className="text-[10px] text-fg-muted">
              La factura original conserva sus valores y estado. Esta devolución solo registró la
              entrada de inventario de los productos devueltos.
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-alert">No se pudo cargar la devolución.</div>
        )}
      </Modal>

      {ticket && <ReturnTicketModal detail={ticket} onClose={() => setTicket(null)} />}
    </div>
  )
}
