'use client'

import { useState, useEffect } from 'react'
import {
  FileText,
  CreditCard,
  Banknote,
  Smartphone,
  RefreshCw,
  DollarSign,
  TrendingUp,
  FileDown,
  Layers } from 'lucide-react'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { MetricCard } from '@/components/tactical/MetricCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { useToast } from '@/components/ui/ToastProvider'
import { formatCOP } from '@/lib/utils/pos-utils'
import { categorizeInvoicePayment } from '@/lib/utils/payment-splits'
import { getAllInvoices, emitFactusElectronicInvoice } from '@/app/actions/pos-actions'
import { InvoiceTable } from '@/components/invoices/InvoiceTable'
import { XmlAuditModal } from '@/components/invoices/XmlAuditModal'
import { InvoiceTicketModal } from '@/components/invoices/InvoiceTicketModal'

export default function InvoicesPage() {
  const { toast } = useToast()
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [methodFilter, setMethodFilter] = useState('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [xmlModalInvoice, setXmlModalInvoice] = useState<any | null>(null)
  const [isXmlModalOpen, setIsXmlModalOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [emittingId, setEmittingId] = useState<string | null>(null)

  const handleEmitFactus = async (saleId: string) => {
    setEmittingId(saleId)
    try {
      const res = await emitFactusElectronicInvoice(saleId)
      if (res.success) {
        const cufeVal = (res as any).cufe ? (res as any).cufe.substring(0, 10) : 'EMITIDA'
        toast(`¡FACTURA ELECTRÓNICA EMITIDA VIA FACTUS V2! CUFE: ${cufeVal}...`)
        fetchInvoices()
      } else {
        toast(`Error al emitir factura: ${res.message}`, 'error')
      }
    } catch (err: any) {
      toast(`Error de red: ${err?.message || 'Conexión fallida'}`, 'error')
    } finally {
      setEmittingId(null)
    }
  }

  const fetchInvoices = async () => {
    setLoading(true)
    try {
      const data = await getAllInvoices()
      setInvoices(data || [])
    } catch (err: any) {
      console.error('Error fetching invoices:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInvoices()
  }, [])

  // Filtering logic
  const filteredInvoices = invoices.filter((inv) => {
    const searchLower = searchQuery.toLowerCase()
    const ticketStr = inv.ticketNumber ? String(inv.ticketNumber).padStart(4, '0') : ''
    const ticketMatch = ticketStr.includes(searchQuery) || (inv.ticketNumber && String(inv.ticketNumber).includes(searchQuery))
    const idMatch = inv.id?.toLowerCase().includes(searchLower)
    const customerNameMatch = inv.customerName?.toLowerCase().includes(searchLower)
    const customerDocMatch = inv.customerDocNumber?.toLowerCase().includes(searchLower)
    const refMatch = inv.paymentReference?.toLowerCase().includes(searchLower)
    const cufeMatch = inv.cufe?.toLowerCase().includes(searchLower)

    const matchesSearch = !searchQuery.trim() || ticketMatch || idMatch || customerNameMatch || customerDocMatch || refMatch || cufeMatch

    // getAllInvoices devuelve labels en español ('EFECTIVO', 'T. CRÉDITO',
    // 'MIXTO (...)'); la clasificación se hace sobre payments[] (enum crudo)
    // con el label como fallback — ver lib/utils/payment-splits.ts.
    const category = categorizeInvoicePayment(inv).category
    let matchesMethod = true
    if (methodFilter === 'CASH') {
      matchesMethod = category === 'CASH'
    } else if (methodFilter === 'NEQUI') {
      matchesMethod = category === 'NEQUI'
    } else if (methodFilter === 'CARDS') {
      matchesMethod = category === 'CARD'
    } else if (methodFilter === 'MIXTO') {
      matchesMethod = category === 'MIXED'
    }

    // Filtro por rango de fechas (DESDE–HASTA, horario local completo del día).
    let matchesDate = true
    if (inv.createdAt) {
      const invDate = new Date(inv.createdAt)
      if (dateFrom) {
        const from = new Date(`${dateFrom}T00:00:00`)
        if (invDate < from) matchesDate = false
      }
      if (matchesDate && dateTo) {
        const to = new Date(`${dateTo}T23:59:59.999`)
        if (invDate > to) matchesDate = false
      }
    }

    return matchesSearch && matchesMethod && matchesDate
  })

  // KPI Calculations
  const completedInvoices = invoices.filter((i) => i.status === 'COMPLETED' || i.status === 'CONFIRMED' || i.status === 'DRAFT')
  const totalBilled = completedInvoices.reduce((acc, curr) => acc + Number(curr.total || 0), 0)
  const invoiceCount = completedInvoices.length
  const avgTicket = invoiceCount > 0 ? totalBilled / invoiceCount : 0

  const cashTotal = completedInvoices
    .filter((i) => categorizeInvoicePayment(i).category === 'CASH')
    .reduce((acc, curr) => acc + Number(curr.total || 0), 0)

  const electronicTotal = completedInvoices
    .filter((i) => {
      const c = categorizeInvoicePayment(i).category
      return c === 'NEQUI' || c === 'CARD'
    })
    .reduce((acc, curr) => acc + Number(curr.total || 0), 0)

  const mixedTotal = completedInvoices
    .filter((i) => categorizeInvoicePayment(i).category === 'MIXED')
    .reduce((acc, curr) => acc + Number(curr.total || 0), 0)

  const handleOpenDetail = (inv: any) => {
    setSelectedInvoice(inv)
    setIsDetailModalOpen(true)
  }

  const handleOpenXml = (inv: any) => {
    setXmlModalInvoice(inv)
    setIsXmlModalOpen(true)
  }

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(text)
    toast(`✓ Copiado al portapapeles: ${label}`)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleExportCSV = () => {
    if (filteredInvoices.length === 0) return

    const headers = ['N Ticket', 'Fecha', 'Cliente', 'Documento', 'Medio Pago', 'Voucher Ref', 'Subtotal', 'IVA 19%', 'Total COP', 'Estado DIAN', 'CUFE']
    const rows = filteredInvoices.map((inv) => [
      inv.ticketNumber ? `FACT-#${String(inv.ticketNumber).padStart(4, '0')}` : inv.id,
      inv.createdAt ? new Date(inv.createdAt).toLocaleString('es-CO') : '',
      `"${inv.customerName || 'CONSUMIDOR FINAL'}"`,
      inv.customerDocNumber || 'N/A',
      `"${inv.paymentMethod || 'EFECTIVO'}"`,
      `"${inv.paymentReference || ''}"`,
      inv.subtotal || 0,
      inv.taxAmount || 0,
      inv.total || 0,
      inv.isElectronicSent ? 'TRANSMITIDA DIAN' : 'PENDIENTE',
      inv.cufe || 'N/A',
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Facturas_POS_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast('✓ Reporte de facturas exportado a CSV exitosamente')
  }

  return (
    <div className="space-y-6 text-fg">
      {/* Header Banner */}
      <PageHeader
        breakpoint="lg"
        icon={<FileText className="w-4 h-4" />}
        kicker="INVOICE & AUDIT CONTROL"
        title="FACTURACIÓN Y COMPROBANTES POS / DIAN"
        description="Gestión en tiempo real de facturas emitidas, transmisión automática DIAN."
        actionsClassName="flex flex-wrap items-center gap-2"
        actions={
          <>
            <TacticalButton
              variant="secondary"
              size="sm"
              onClick={fetchInvoices}
              loading={loading}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              RECARGAR
            </TacticalButton>

            <TacticalButton
              variant="primary"
              size="sm"
              onClick={handleExportCSV}
              icon={<FileDown className="w-3.5 h-3.5" />}
            >
              EXPORTAR EXCEL / CSV
            </TacticalButton>
          </>
        }
      />

      {/* Dynamic DB Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="TOTAL FACTURADO"
          value={formatCOP(totalBilled)}
          subtext="Valorización de ventas en COP"
          trend={invoiceCount > 0 ? `${invoiceCount} FACTURAS` : 'SIN VENTAS'}
          trendType={invoiceCount > 0 ? 'positive' : 'neutral'}
          accentColor="orange"
          icon={<DollarSign className="w-4 h-4 text-accent" />}
        />
        <MetricCard
          title="TICKET PROMEDIO"
          value={formatCOP(avgTicket)}
          subtext="Promedio por transacción"
          trend="ESTADÍSTICA POS"
          trendType="positive"
          accentColor="green"
          icon={<TrendingUp className="w-4 h-4 text-success" />}
        />
        <MetricCard
          title="RECAUDO EFECTIVO"
          value={formatCOP(cashTotal)}
          subtext="Ventas en caja chica"
          trend="CAJA PRINCIPAL"
          trendType="neutral"
          accentColor="blue"
          icon={<Banknote className="w-4 h-4 text-blue" />}
        />
        <MetricCard
          title="PAGOS DIGITALES & MIXTOS"
          value={formatCOP(electronicTotal + mixedTotal)}
          subtext="Nequi, Tarjetas y Multi-Pago"
          trend={mixedTotal > 0 ? `Mixtos: ${formatCOP(mixedTotal)}` : 'CONCILIACIÓN'}
          trendType="neutral"
          accentColor="neutral"
          icon={<CreditCard className="w-4 h-4 text-purple" />}
        />
      </div>

      {/* Orange Tabs Bar */}
      <div className="bg-panel border border-line rounded-[6px] p-2 flex flex-wrap gap-2">
        {[
          { id: 'ALL', label: 'TODAS LAS FACTURAS', icon: FileText },
          { id: 'CASH', label: 'VENTAS EN EFECTIVO', icon: Banknote },
          { id: 'NEQUI', label: 'VENTAS NEQUI', icon: Smartphone },
          { id: 'CARDS', label: 'VENTAS EN TARJETA', icon: CreditCard },
          { id: 'MIXTO', label: '⚡ PAGOS MIXTOS (MULTI-PAGO)', icon: Layers },
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = methodFilter === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setMethodFilter(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-bold tracking-wider transition-all cursor-pointer ${isActive
                  ? 'bg-accent text-white border border-accent'
                  : 'bg-surface text-fg-muted border border-line hover:text-fg hover:border-line-strong'
                }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-fg-muted'}`} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* SectionPanel with Table */}
      <InvoiceTable
        loading={loading}
        rows={filteredInvoices}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onClearDates={() => {
          setDateFrom('')
          setDateTo('')
        }}
        copiedId={copiedId}
        onCopy={handleCopy}
        emittingId={emittingId}
        onEmit={handleEmitFactus}
        onOpenDetail={handleOpenDetail}
        onOpenXml={handleOpenXml}
      />

      {/* MODAL 1: AUDITORÍA XML / COMPROBANTE ELECTRÓNICO DIAN FACTUS V2 */}
      {isXmlModalOpen && xmlModalInvoice && (
        <XmlAuditModal invoice={xmlModalInvoice} onClose={() => setIsXmlModalOpen(false)} />
      )}

      {/* MODAL 2: COMPROBANTE Y VER FACTURA DETALLADA CON PAGOS MÚLTIPLES */}
      {isDetailModalOpen && selectedInvoice && (
        <InvoiceTicketModal invoice={selectedInvoice} onClose={() => setIsDetailModalOpen(false)} />
      )}
    </div>
  )
}
