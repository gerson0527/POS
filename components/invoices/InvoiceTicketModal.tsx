'use client'

import { useState } from 'react'
import { Printer, ShieldAlert } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Modal } from '@/components/ui/Modal'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { formatCOP } from '@/lib/utils/pos-utils'
import { numeroALetras } from '@/lib/dian/amount-in-words'
import {
  dianPayment,
  cufeLines,
  fiscalUiStatus,
} from '@/components/invoices/invoice-utils'

interface InvoiceTicketModalProps {
  invoice: any
  onClose: () => void
  /** Habilita el ajuste de IVA (contadora / admin / supervisor). */
  canEditTax?: boolean
  /** Guarda la nueva tarifa de IVA de una línea. */
  onSaveTax?: (itemId: string, ivaRate: number) => Promise<void>
}

const IVA_OPTIONS = [
  { value: 19, label: '19% — IVA general' },
  { value: 5, label: '5% — Tarifa reducida' },
  { value: 0, label: '0% — Exento / Excluido' },
  { value: 8, label: '8% — Impoconsumo' },
]

export function InvoiceTicketModal({
  invoice,
  onClose,
  canEditTax = false,
  onSaveTax,
}: InvoiceTicketModalProps) {
  const fiscal = fiscalUiStatus(invoice)
  // Un CUFE indica que el documento fue transmitido; solo ACCEPTED tiene valor
  // fiscal pleno. Un rechazo o falla técnica nunca se presenta como aceptado.
  const isElectronicSent = Boolean(fiscal.cufe || fiscal.isAccepted)
  const isFiscalValid = fiscal.isAccepted
  const cufe = fiscal.cufe
  // El IVA sólo se puede corregir mientras el documento NO tiene CUFE.
  const canAdjustTax = canEditTax && !fiscal.cufe && typeof onSaveTax === 'function'
  const [savingItemId, setSavingItemId] = useState<string | null>(null)

  async function handleRateChange(itemId: string, rate: number) {
    if (!onSaveTax) return
    setSavingItemId(itemId)
    try {
      await onSaveTax(itemId, rate)
    } finally {
      setSavingItemId(null)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="COMPROBANTE FACTURA POS // AUDITORÍA"
      icon={<Printer className="w-4 h-4" />}
      size="lg"
      actions={
        <TacticalButton variant="primary" size="sm" onClick={() => window.print()}>
          <Printer className="w-3.5 h-3.5 mr-1" /> IMPRIMIR FACTURA
        </TacticalButton>
      }
    >
      {/* AJUSTE FISCAL DE IVA (sólo facturas pendientes, no se imprime) */}
      {canAdjustTax && invoice.items && invoice.items.length > 0 && (
        <div className="no-print mb-3 rounded border border-warn-line bg-warn-dim/40 p-3 space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-warn">
            <ShieldAlert className="w-4 h-4" />
            <span>Ajuste fiscal de IVA — factura pendiente de transmisión</span>
          </div>
          <p className="text-[10px] text-fg-muted">
            Corrija la tarifa de IVA de cada línea antes de transmitir a la DIAN. El total de la
            factura y los impuestos se recalculan automáticamente. Si el total cambia, la
            diferencia queda pendiente de manejo en caja.
          </p>
          <div className="space-y-1.5">
            {invoice.items.map((item: any) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded border border-line bg-input px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-bold uppercase text-fg">
                    {item.productName || item.productId}
                  </div>
                  <div className="text-[9px] text-fg-muted">
                    SKU {item.productSku || item.productId} • {Number(item.quantity)} und •
                    IVA actual {Number(item.ivaRate || 0)}%
                  </div>
                </div>
                <select
                  aria-label={`Tarifa IVA de ${item.productName || item.productId}`}
                  disabled={savingItemId === item.id}
                  value={String(Number(item.ivaRate || 0))}
                  onChange={(e) => handleRateChange(item.id, Number(e.target.value))}
                  className="bg-night-mid border border-line text-fg font-mono text-[11px] px-2 py-1 rounded outline-none focus:border-accent disabled:opacity-50"
                >
                  {IVA_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FORMATO IMPRESO POS DIAN */}
      <div id="invoice-printable" className="bg-white text-black p-6 font-mono text-xs space-y-3 rounded shadow border border-gray-200">
        <div className="text-center space-y-0.5 border-b-2 border-black pb-2">
          <h2 className="font-black text-[13px] uppercase tracking-wide">
            {invoice.company?.legalName || 'COMERCIALIZADORA POS RETAIL S.A.S.'}
          </h2>
          <p className="text-[10px] font-bold">
            NIT {invoice.company?.nit || '—'}
            <span className="font-normal"> • IVA Régimen Común</span>
          </p>
          {(invoice.company?.address || invoice.company?.city) && (
            <p className="text-[10px]">
              {invoice.company?.address}
              {invoice.company?.city ? ` • ${invoice.company.city}` : ''}
            </p>
          )}
          <p className="text-[9px] text-gray-600 uppercase">
            {isElectronicSent
              ? `Facturación electrónica DIAN • Proveedor tecnológico FACTUS V2${
                  invoice.dianEnvironment === 'production'
                    ? ' • AMBIENTE: PRODUCCIÓN'
                    : ' • AMBIENTE: SANDBOX (HABILITACIÓN)'
                }`
              : 'Comprobante de venta POS'}
          </p>
          <div className="mt-2 inline-block border-2 border-black px-4 py-1">
            <p className="font-black text-[12px] uppercase">
              {isElectronicSent
                ? `${
                    fiscal.isRejected
                      ? 'FACTURA ELECTRÓNICA RECHAZADA'
                      : 'FACTURA DE VENTA ELECTRÓNICA'
                  } N° ${invoice.fullNumber}`
                : `FACTURA DE VENTA N° ${
                    invoice.fullNumber ||
                    `FACT-#${String(invoice.ticketNumber || 0).padStart(4, '0')}`
                  }`}
            </p>
          </div>
          {!isElectronicSent && (
            <p className="text-[8px] text-gray-500">
              Documento interno de venta — no constituye factura electrónica ante la DIAN
            </p>
          )}
          {isElectronicSent && invoice.fullNumber && invoice.ticketNumber && (
            <p className="text-[9px] text-gray-600 pt-1">
              TICKET INTERNO N° {String(invoice.ticketNumber).padStart(4, '0')}
            </p>
          )}
        </div>

        {/* DATOS CLIENTE Y FECHA */}
        <div className="space-y-1 text-[10px] border-b pb-2 border-gray-300">
          <div className="flex justify-between">
            <span>FECHA Y HORA DE EXPEDICIÓN:</span>
            <span className="font-bold">
              {invoice.createdAtDisplay ||
                (invoice.createdAt ? new Date(invoice.createdAt).toLocaleString('es-CO') : 'N/A')}
            </span>
          </div>
          <div className="flex justify-between">
            <span>CLIENTE:</span>
            <span className="font-bold uppercase">{invoice.customerName || 'CONSUMIDOR FINAL'}</span>
          </div>
          {invoice.customerDocNumber && (
            <div className="flex justify-between">
              <span>DOCUMENTO:</span>
              <span>{invoice.customerDocType || 'CC'}: {invoice.customerDocNumber}</span>
            </div>
          )}
          {invoice.customerPhone && (
            <div className="flex justify-between">
              <span>TELÉFONO:</span>
              <span>{invoice.customerPhone}</span>
            </div>
          )}
        </div>

        {/* TABLA DE ÍTEMS COMPRADOS */}
        <div className="space-y-1 border-b pb-2 border-gray-300">
          <p className="font-bold text-center text-[10px] uppercase border-b pb-1 mb-1 border-gray-300">
            DETALLE DE PRODUCTOS COMPRADOS
          </p>
          {invoice.items && invoice.items.length > 0 ? (
            <div className="space-y-1.5 text-[10px]">
              <div className="grid grid-cols-12 font-bold border-b border-black pb-1 text-[9px]">
                <span className="col-span-1 text-center">CANT</span>
                <span className="col-span-5">DESCRIPCIÓN</span>
                <span className="col-span-2 text-right">V.UNIT</span>
                <span className="col-span-2 text-right">IVA</span>
                <span className="col-span-2 text-right">TOTAL</span>
              </div>
              {invoice.items.map((item: any) => (
                <div key={item.id} className="grid grid-cols-12 text-[10px] py-1 border-b border-dotted border-gray-200">
                  <span className="col-span-1 text-center font-bold">{Number(item.quantity)}</span>
                  <span className="col-span-5 pr-1 font-sans leading-tight">
                    <span className="block uppercase truncate">{item.productName || item.productId}</span>
                    <span className="block text-[8px] text-gray-500">
                      SKU {item.productSku || item.productId} • IVA {Number(item.ivaRate || 0)}%
                    </span>
                  </span>
                  <span className="col-span-2 text-right">{formatCOP(Number(item.unitPrice || 0))}</span>
                  <span className="col-span-2 text-right">{formatCOP(Number(item.ivaAmount || 0))}</span>
                  <span className="col-span-2 text-right font-bold">
                    {formatCOP(Number(item.lineTotal || 0))}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-[10px] text-gray-500 py-1">[DETALLE DE ÍTEMS NO DISPONIBLE]</p>
          )}
        </div>

        {/* RESUMEN DE LIQUIDACIÓN */}
        <div className="space-y-1 text-[11px] pt-1 border-t border-gray-300">
          <div className="flex justify-between">
            <span>SUBTOTAL BASE:</span>
            <span>{formatCOP(Number(invoice.subtotal || 0))}</span>
          </div>
          <div className="flex justify-between">
            <span>IVA TOTAL:</span>
            <span>{formatCOP(Number(invoice.taxAmount || 0))}</span>
          </div>
          {Number(invoice.discountAmount) > 0 && (
            <div className="flex justify-between text-red-700 font-bold">
              <span>DESCUENTO:</span>
              <span>-{formatCOP(Number(invoice.discountAmount))}</span>
            </div>
          )}
          <div className="flex justify-between font-black text-sm border-t-2 border-black pt-1.5">
            <span>TOTAL PAGADO:</span>
            <span>{formatCOP(Number(invoice.total || 0))}</span>
          </div>
          <p className="text-[9px] text-gray-700 pt-1 border-t border-dotted border-gray-400 leading-tight">
            SON: {numeroALetras(Number(invoice.total || 0))} PESOS M/CTE
          </p>
        </div>

        {/* MEDIO DE PAGO Y AUDITORÍA DE PAGOS MÚLTIPLES */}
        <div className="border-t-2 border-black pt-2 text-[10px] space-y-1">
          <p className="font-bold uppercase text-center text-[9px] border-b border-black pb-0.5 mb-1">
            {isElectronicSent ? 'FORMAS DE PAGO (CATÁLOGO DIAN)' : 'FORMAS DE PAGO'}
          </p>
          {invoice.payments && invoice.payments.length > 0 ? (
            invoice.payments.map((p: any) => {
              const dp = dianPayment(p.method, p.reference)
              return (
                <div key={p.id} className="flex justify-between items-center py-0.5">
                  <span className="font-bold uppercase">
                    {dp.label} ({dp.code})
                    {dp.reference ? ` — Ref: ${dp.reference}` : ''}
                  </span>
                  <span className="font-bold">{formatCOP(Number(p.amount))}</span>
                </div>
              )
            })
          ) : (
            (() => {
              const dp = dianPayment(invoice.paymentMethod)
              return (
                <div className="flex justify-between">
                  <span className="font-bold uppercase">
                    {dp.label} ({dp.code})
                  </span>
                  <span className="font-bold">{formatCOP(Number(invoice.total || 0))}</span>
                </div>
              )
            })()
          )}
        </div>

        {/* PIE DEL COMPROBANTE / TRAZABILIDAD DIAN */}
        <div className="text-center text-[9px] text-gray-600 pt-3 border-t-2 border-black space-y-1">
          <p className="font-black uppercase text-black text-[10px]">
            {isFiscalValid
              ? 'FACTURA ELECTRÓNICA DE VENTA - DOCUMENTO CON VALOR FISCAL'
              : isElectronicSent
                ? `DOCUMENTO ELECTRÓNICO - ${fiscal.label}`
                : 'COMPROBANTE DE VENTA - DOCUMENTO INTERNO'}
          </p>
          <p className="font-bold text-black">¡MUCHAS GRACIAS POR SU COMPRA!</p>
          <p>Conserve este comprobante para garantías.</p>

          {isElectronicSent && (
            <div className="flex justify-center gap-4 text-[10px] font-bold text-black pt-1 border-t border-dotted border-gray-400 mt-1">
              <span>FOLIO: {invoice.fullNumber}</span>
              <span>ESTADO DIAN: {fiscal.label}</span>
            </div>
          )}

          {isFiscalValid && invoice.qrUrl && (
            <div className="mx-auto my-2 w-28 h-28 flex items-center justify-center border border-gray-400 p-1.5 bg-white">
              <QRCodeSVG value={invoice.qrUrl} size={96} level="M" />
            </div>
          )}

          {cufe && cufeLines(cufe).length > 0 && (
            <div className="text-black pt-1">
              <p className="font-bold text-[9px] mb-0.5">CUFE - CÓDIGO ÚNICO DE FACTURA ELECTRÓNICA</p>
              <p className="font-mono text-[8.5px] leading-[1.4] whitespace-pre-line">
                {cufeLines(cufe).join('\n')}
              </p>
            </div>
          )}

          {isFiscalValid && invoice.qrUrl && (
            <p className="text-[8px] break-all text-gray-500 pt-1">
              Consulte/valide este documento en: {invoice.qrUrl}
            </p>
          )}

          {isElectronicSent && (invoice.pdfUrl || invoice.xmlUrl) && (
            <p className="no-print flex justify-center gap-4 pt-2">
              {invoice.pdfUrl && (
                <a
                  href={invoice.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent font-bold underline text-[10px]"
                >
                  PDF FIRMADO
                </a>
              )}
              {invoice.xmlUrl && (
                <a
                  href={invoice.xmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent font-bold underline text-[10px]"
                >
                  XML FIRMADO
                </a>
              )}
            </p>
          )}

          {isFiscalValid && (
            <p className="text-[8px] text-gray-500 pt-1 leading-tight">
              Documento electrónico verificable en el consultor de la DIAN.
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-line-dim no-print">
        <TacticalButton variant="secondary" size="sm" onClick={onClose}>
          CERRAR
        </TacticalButton>
        <TacticalButton variant="primary" size="sm" onClick={() => window.print()}>
          <Printer className="w-3.5 h-3.5 mr-1" /> IMPRIMIR FACTURA
        </TacticalButton>
      </div>
    </Modal>
  )
}
