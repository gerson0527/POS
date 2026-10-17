'use client'

import { Printer } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Modal } from '@/components/ui/Modal'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { formatCOP } from '@/lib/utils/pos-utils'
import { numeroALetras } from '@/lib/dian/amount-in-words'
import { dianPayment, cufeLines } from '@/components/invoices/invoice-utils'

interface InvoiceTicketModalProps {
  invoice: any
  onClose: () => void
}

export function InvoiceTicketModal({ invoice, onClose }: InvoiceTicketModalProps) {
  // Solo es una factura electrónica real si DIAN ya la aceptó (CUFE presente).
  // Un fiscal_document en PENDING_GENERATION es un documento interno, no fiscal.
  const isElectronicSent = Boolean(invoice.isElectronicSent || invoice.cufe)

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
                ? `FACTURA DE VENTA ELECTRÓNICA N° ${invoice.fullNumber}`
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
            <span>IVA (19% IMPUESTO):</span>
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
            {isElectronicSent
              ? 'FACTURA ELECTRÓNICA DE VENTA — DOCUMENTO CON VALOR FISCAL'
              : 'COMPROBANTE DE VENTA — DOCUMENTO INTERNO'}
          </p>
          <p className="font-bold text-black">¡MUCHAS GRACIAS POR SU COMPRA!</p>
          <p>Conserve este comprobante para garantías.</p>

          {isElectronicSent && (
            <div className="flex justify-center gap-4 text-[10px] font-bold text-black pt-1 border-t border-dotted border-gray-400 mt-1">
              <span>FOLIO: {invoice.fullNumber}</span>
              <span>
                ESTADO DIAN:{' '}
                {invoice.fiscalDocument?.status === 'ACCEPTED'
                  ? 'ACEPTADA'
                  : invoice.fiscalDocument?.status === 'REJECTED'
                    ? 'RECHAZADA'
                    : invoice.fiscalDocument?.status === 'CONTINGENCY_ISSUED'
                      ? 'CONTINGENCIA'
                      : 'TRANSMITIDA'}
              </span>
            </div>
          )}

          {isElectronicSent && invoice.qrUrl && (
            <div className="mx-auto my-2 w-28 h-28 flex items-center justify-center border border-gray-400 p-1.5 bg-white">
              <QRCodeSVG value={invoice.qrUrl} size={96} level="M" />
            </div>
          )}

          {isElectronicSent && cufeLines(invoice.cufe || invoice.fiscalDocument?.uniqueCode).length > 0 && (
            <div className="text-black pt-1">
              <p className="font-bold text-[9px] mb-0.5">CUFE — CÓDIGO ÚNICO DE FACTURA ELECTRÓNICA</p>
              <p className="font-mono text-[8.5px] leading-[1.4] whitespace-pre-line">
                {cufeLines(invoice.cufe || invoice.fiscalDocument?.uniqueCode).join('\n')}
              </p>
            </div>
          )}

          {isElectronicSent && invoice.qrUrl && (
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

          {isElectronicSent && (
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
