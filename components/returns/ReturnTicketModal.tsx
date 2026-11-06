'use client'

import { Printer } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { REFUND_METHOD_LABELS } from '@/lib/returns/constants'
import type { CustomerReturnDetail } from '@/lib/returns/service'
import type { RefundMethod } from '@/lib/types'
import { numeroALetras } from '@/lib/dian/amount-in-words'
import { formatCOP } from '@/lib/utils/pos-utils'

interface ReturnTicketModalProps {
  detail: CustomerReturnDetail
  onClose: () => void
}

function saleReference(detail: CustomerReturnDetail): string {
  if (detail.invoiceNumber) return detail.invoiceNumber
  if (detail.saleTicketNumber) return `TICKET #${String(detail.saleTicketNumber).padStart(4, '0')}`
  return detail.saleId
}

export function ReturnTicketModal({ detail, onClose }: ReturnTicketModalProps) {
  const company = detail.company
  const refundLabel =
    REFUND_METHOD_LABELS[detail.refundMethod as RefundMethod] || detail.refundMethod

  return (
    <Modal
      open
      onClose={onClose}
      title={`TICKET ${detail.returnNumberLabel}`}
      icon={<Printer className="w-4 h-4" />}
      size="lg"
      zIndexClass="z-[60]"
      actions={
        <TacticalButton variant="primary" size="sm" onClick={() => window.print()}>
          <Printer className="w-3.5 h-3.5 mr-1" /> IMPRIMIR TICKET
        </TacticalButton>
      }
    >
      <div
        id="return-printable"
        className="bg-white text-black p-6 font-mono text-xs space-y-3 rounded shadow border border-gray-200 mx-auto max-w-md"
      >
        <div className="text-center space-y-0.5 border-b-2 border-black pb-2">
          <h2 className="font-black text-[13px] uppercase tracking-wide">
            {company?.legalName || company?.tradeName || 'POS RETAIL'}
          </h2>
          {company?.nit && <p className="text-[10px] font-bold">NIT {company.nit}</p>}
          {(company?.address || company?.city) && (
            <p className="text-[10px]">
              {company.address}
              {company.city ? ` • ${company.city}` : ''}
            </p>
          )}
          <p className="text-[9px] text-gray-600 uppercase">Comprobante interno de devolución</p>
          <div className="mt-2 inline-block border-2 border-black px-4 py-1">
            <p className="font-black text-[12px] uppercase">
              DEVOLUCIÓN N° {detail.returnNumberLabel}
            </p>
          </div>
          <p className="text-[8px] text-gray-500 pt-1">
            Documento interno. No constituye nota crédito electrónica ante la DIAN.
          </p>
        </div>

        <div className="space-y-1 text-[10px] border-b pb-2 border-gray-300">
          <div className="flex justify-between gap-3">
            <span>FECHA Y HORA:</span>
            <span className="font-bold text-right">
              {detail.createdAt ? new Date(detail.createdAt).toLocaleString('es-CO') : '—'}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span>CLIENTE:</span>
            <span className="font-bold uppercase text-right">
              {detail.customerName || 'CONSUMIDOR FINAL'}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span>DOCUMENTO:</span>
            <span className="text-right">{detail.customerDocNumber || 'SIN DOCUMENTO'}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>VENTA ORIGINAL:</span>
            <span className="font-bold text-right">{saleReference(detail)}</span>
          </div>
          {detail.locationName && (
            <div className="flex justify-between gap-3">
              <span>SEDE:</span>
              <span className="text-right">{detail.locationName}</span>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <span>OPERADOR:</span>
            <span className="text-right">{detail.userName || '—'}</span>
          </div>
        </div>

        <div className="space-y-1 border-b pb-2 border-gray-300">
          <p className="font-bold text-center text-[10px] uppercase border-b pb-1 mb-1 border-gray-300">
            Productos devueltos
          </p>
          <div className="grid grid-cols-12 font-bold border-b border-black pb-1 text-[9px]">
            <span className="col-span-2 text-center">CANT</span>
            <span className="col-span-6">DESCRIPCIÓN</span>
            <span className="col-span-4 text-right">TOTAL</span>
          </div>
          {detail.items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-12 text-[10px] py-1 border-b border-dotted border-gray-200"
            >
              <span className="col-span-2 text-center font-bold">{Number(item.quantity)}</span>
              <span className="col-span-6 pr-1 leading-tight">
                <span className="block uppercase">{item.productName || item.productId}</span>
                <span className="block text-[8px] text-gray-500">
                  SKU {item.sku || '—'} · {formatCOP(Number(item.unitPrice || 0))}
                </span>
              </span>
              <span className="col-span-4 text-right font-bold">
                {formatCOP(Number(item.lineTotal || 0))}
              </span>
            </div>
          ))}
        </div>

        <div className="space-y-1 text-[11px]">
          <div className="flex justify-between">
            <span>SUBTOTAL:</span>
            <span>{formatCOP(Number(detail.subtotal || 0))}</span>
          </div>
          <div className="flex justify-between">
            <span>IVA:</span>
            <span>{formatCOP(Number(detail.taxAmount || 0))}</span>
          </div>
          <div className="flex justify-between font-black text-sm border-t-2 border-black pt-1.5">
            <span>TOTAL DEVUELTO:</span>
            <span>{formatCOP(Number(detail.total || 0))}</span>
          </div>
          <p className="text-[9px] text-gray-700 pt-1 leading-tight">
            SON: {numeroALetras(Number(detail.total || 0))} PESOS M/CTE
          </p>
          <div className="flex justify-between text-[10px] pt-1">
            <span>REEMBOLSO:</span>
            <span className="font-bold uppercase text-right">{refundLabel}</span>
          </div>
          {detail.refundReference && (
            <div className="flex justify-between text-[10px]">
              <span>REFERENCIA:</span>
              <span className="text-right">{detail.refundReference}</span>
            </div>
          )}
        </div>

        <div className="text-[10px] border-t border-gray-300 pt-2 space-y-1">
          <p>
            <span className="font-bold">MOTIVO: </span>
            {detail.reason || '—'}
          </p>
          {detail.notes && (
            <p>
              <span className="font-bold">NOTAS: </span>
              {detail.notes}
            </p>
          )}
        </div>

        <div className="text-center text-[9px] text-gray-600 pt-2 border-t-2 border-black space-y-1">
          <p className="font-black uppercase text-black text-[10px]">
            {detail.unitCount} unidad(es) ingresadas al inventario
          </p>
          <p>La factura original conserva sus valores. Este comprobante solo acredita la devolución de producto.</p>
          <p className="font-bold text-black">Conserve este ticket.</p>
        </div>
      </div>
    </Modal>
  )
}
