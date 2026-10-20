'use client'

import {
  Calendar,
  Printer,
  Copy,
  Check,
  AlertTriangle,
  Code,
  Eye,
  RefreshCw,
  Zap,
  Layers,
  ShoppingBag,
  Smartphone,
  Banknote,
  CreditCard,
  ShieldCheck,
  X,
} from 'lucide-react'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { DataTable } from '@/components/ui/DataTable'
import { SearchInput } from '@/components/ui/SearchInput'
import { formatCOP } from '@/lib/utils/pos-utils'
import { invoiceFlags } from '@/components/invoices/invoice-utils'

interface InvoiceTableProps {
  loading: boolean
  rows: any[]
  searchQuery: string
  onSearchChange: (v: string) => void
  dateFrom: string
  dateTo: string
  onDateFromChange: (v: string) => void
  onDateToChange: (v: string) => void
  onClearDates: () => void
  copiedId: string | null
  onCopy: (text: string, label: string) => void
  emittingId: string | null
  onEmit: (saleId: string) => void
  onOpenDetail: (inv: any) => void
  onOpenXml: (inv: any) => void
}

export function InvoiceTable({
  loading,
  rows,
  searchQuery,
  onSearchChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onClearDates,
  copiedId,
  onCopy,
  emittingId,
  onEmit,
  onOpenDetail,
  onOpenXml,
}: InvoiceTableProps) {
  return (
    <SectionPanel
      title="DIRECTORIO DE FACTURAS"
      subtitle="CATÁLOGO HISTÓRICO DE FACTURAS EMITIDAS CON ESTADO Y VISOR XML"
      statusSlot={
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            size="sm"
            inputClassName="bg-input font-mono w-64"
            placeholder="BUSCAR FACTURA / CLIENTE / CUFE..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {/* Filtro por rango de fechas: DESDE – HASTA (sin presets) */}
          <div className="flex items-stretch bg-input border border-line hover:border-line-strong focus-within:border-accent rounded overflow-hidden transition-colors">
            <div className="flex items-center gap-1.5 px-2.5 border-r border-line">
              <Calendar className="w-3.5 h-3.5 text-accent" />
              <span className="font-mono text-[9px] text-fg-muted uppercase tracking-widest">Rango</span>
            </div>
            <label className="flex items-center gap-1.5 px-2.5 py-1.5 border-r border-line cursor-pointer">
              <span className="font-mono text-[9px] text-accent uppercase tracking-widest font-bold">Desde</span>
              <input
                type="date"
                aria-label="Fecha desde"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => onDateFromChange(e.target.value)}
                className="bg-transparent text-fg font-mono text-xs outline-none cursor-pointer"
              />
            </label>
            <label className="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer">
              <span className="font-mono text-[9px] text-accent uppercase tracking-widest font-bold">Hasta</span>
              <input
                type="date"
                aria-label="Fecha hasta"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => onDateToChange(e.target.value)}
                className="bg-transparent text-fg font-mono text-xs outline-none cursor-pointer"
              />
            </label>
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={onClearDates}
                title="Limpiar rango de fechas"
                className="px-2.5 border-l border-line text-fg-muted hover:text-alert hover:bg-danger-bg/40 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      }
      contentClassName="p-0 overflow-hidden"
    >
      <DataTable
        columns={[
          {
            key: 'ticket',
            header: 'CONSECUTIVO / TICKET',
            cellClassName: 'whitespace-nowrap',
            render: (inv: any) => {
              const { ticketFormatted, isWithoutStock } = invoiceFlags(inv)
              return (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 font-bold text-accent font-mono">
                    <span>{ticketFormatted}</span>
                    <button
                      onClick={() => onCopy(ticketFormatted, ticketFormatted)}
                      className="text-fg-muted hover:text-accent transition-colors"
                      title="Copiar consecutivo"
                    >
                      {copiedId === ticketFormatted ? <Check className="w-3 h-3 text-ok" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                  {isWithoutStock && (
                    <span className="inline-flex items-center gap-1 bg-danger-bg text-red-soft border border-alert text-[9px] font-bold px-1.5 py-0.5 rounded font-mono uppercase tracking-wider animate-pulse w-fit">
                      <AlertTriangle className="w-3 h-3 text-alert shrink-0" />
                      <span>VENTA SIN STOCK</span>
                    </span>
                  )}
                </div>
              )
            },
          },
          {
            key: 'date',
            header: 'FECHA',
            cellClassName: 'text-fg whitespace-nowrap',
            render: (inv: any) => (
              <div className="flex items-center gap-1.5 text-[11px]">
                <Calendar className="w-3.5 h-3.5 text-fg-muted" />
                <span>{inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('es-CO') : 'N/A'}</span>
              </div>
            ),
          },
          {
            key: 'customer',
            header: 'CLIENTE ADQUIRENTE',
            render: (inv: any) =>
              inv.customerName ? (
                <div>
                  <div className="font-bold text-fg uppercase text-[11px]">{inv.customerName}</div>
                  <div className="text-[10px] text-fg-muted">
                    {inv.customerDocType || 'CC'}: {inv.customerDocNumber}
                  </div>
                </div>
              ) : (
                <span className="text-fg-muted italic text-[11px]">CONSUMIDOR FINAL</span>
              ),
          },
          {
            key: 'items',
            header: 'ÍTEMS',
            align: 'center',
            cellClassName: 'whitespace-nowrap',
            render: (inv: any) => (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-ash border border-line-hover text-fg text-[11px]">
                <ShoppingBag className="w-3 h-3 text-accent" />
                <span>{invoiceFlags(inv).totalItemsCount} prod.</span>
              </span>
            ),
          },
          {
            key: 'payment',
            header: 'MEDIO DE PAGO',
            cellClassName: 'whitespace-nowrap',
            render: (inv: any) => {
              const { isMixedPayment } = invoiceFlags(inv)
              return isMixedPayment ? (
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-warn-bg border border-accent text-accent font-bold text-[10px] uppercase shadow">
                  <Layers className="w-3 h-3 text-accent" />
                  <span>{inv.paymentMethod?.replace('CASH', 'EFECTIVO')}</span>
                </div>
              ) : (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${inv.paymentMethod === 'NEQUI'
                      ? 'bg-violet-bg text-violet-fg border border-violet-line'
                      : inv.paymentMethod === 'CREDIT_CARD' || inv.paymentMethod === 'DEBIT_CARD'
                        ? 'bg-info-bg text-info-fg border border-info-line'
                        : 'bg-success-bg text-success-fg border border-success-line'
                    }`}
                >
                  {inv.paymentMethod === 'NEQUI' && <Smartphone className="w-3 h-3" />}
                  {(inv.paymentMethod === 'CASH' || inv.paymentMethod === 'EFECTIVO' || !inv.paymentMethod) && (
                    <Banknote className="w-3 h-3" />
                  )}
                  {(inv.paymentMethod === 'CREDIT_CARD' || inv.paymentMethod === 'DEBIT_CARD') && (
                    <CreditCard className="w-3 h-3" />
                  )}
                  {inv.paymentMethod === 'CASH' ? 'EFECTIVO' : inv.paymentMethod || 'EFECTIVO'}
                </span>
              )
            },
          },
          {
            key: 'total',
            header: 'TOTAL FACTURADO',
            align: 'right',
            cellClassName: 'font-bold text-fg text-sm whitespace-nowrap',
            render: (inv: any) => formatCOP(Number(inv.total || 0)),
          },
          {
            key: 'dian',
            header: 'ESTADO DIAN',
            align: 'center',
            cellClassName: 'whitespace-nowrap',
            render: (inv: any) => {
              const { fiscal } = invoiceFlags(inv)
              if (fiscal.isAccepted) {
                return (
                  <div className="flex flex-col items-center gap-1">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase bg-ok-dim border border-ok-line text-ok shadow">
                      <ShieldCheck className="w-3.5 h-3.5 text-ok" />
                      <span>ACEPTADA (DIAN)</span>
                    </span>
                    {fiscal.cufe && (
                      <span className="text-[9px] text-fg-muted font-mono">
                        CUFE: {String(fiscal.cufe).substring(0, 12)}...
                      </span>
                    )}
                  </div>
                )
              }
              if (fiscal.isRejected) {
                return (
                  <TacticalButton
                    variant="secondary"
                    size="sm"
                    onClick={() => onEmit(inv.id)}
                    loading={emittingId === inv.id}
                    icon={<RefreshCw className="w-3 h-3 text-danger" />}
                  >
                    REINTENTAR ({fiscal.label})
                  </TacticalButton>
                )
              }
              if (fiscal.isTransmitted) {
                return (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase bg-warn-dim border border-warn-line text-warn">
                    <RefreshCw className="w-3.5 h-3.5" />
                    {fiscal.label}
                  </span>
                )
              }
              return (
                <TacticalButton
                  variant="secondary"
                  size="sm"
                  onClick={() => onEmit(inv.id)}
                  loading={emittingId === inv.id}
                  icon={<Zap className="w-3 h-3 text-accent" />}
                >
                  TRANSMITIR DIAN
                </TacticalButton>
              )
            },
          },
          {
            key: 'actions',
            header: 'ACCIONES',
            align: 'center',
            cellClassName: 'whitespace-nowrap',
            render: (inv: any) => (
              <div className="flex items-center justify-center gap-1">
                <button
                  onClick={() => onOpenDetail(inv)}
                  className="p-1.5 bg-night-mid border border-line text-fg hover:bg-accent hover:text-white rounded transition-colors cursor-pointer"
                  title="Ver Factura Completa"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onOpenXml(inv)}
                  className="p-1.5 bg-night-mid border border-line text-accent hover:bg-accent hover:text-white rounded transition-colors cursor-pointer"
                  title="Ver XML / Auditoría DIAN"
                >
                  <Code className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onOpenDetail(inv)}
                  className="p-1.5 bg-night-mid border border-line text-fg hover:bg-accent hover:text-white rounded transition-colors cursor-pointer"
                  title="Imprimir Ticket POS"
                >
                  <Printer className="w-3.5 h-3.5" />
                </button>
              </div>
            ),
          },
        ]}
        rows={loading ? [] : rows}
        rowKey={(inv: any) => inv.id}
        rowClassName={(inv: any) =>
          invoiceFlags(inv).isWithoutStock
            ? 'transition-colors bg-rose-surface-2/70 hover:bg-rose-surface-3 border-l-4 border-l-alert'
            : 'transition-colors hover:bg-ash'
        }
        emptyMessage={
          loading ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-accent" />
              <span>Cargando facturas...</span>
            </>
          ) : (
            '[NO SE ENCONTRARON FACTURAS QUE COINCIDAN CON LA BÚSQUEDA]'
          )
        }
        tableClassName="w-full text-left font-mono text-xs border-collapse"
        theadClassName="bg-panel border-b border-line text-fg-muted uppercase text-[10px] tracking-wider"
        tbodyClassName="divide-y divide-line-faint"
      />
    </SectionPanel>
  )
}
