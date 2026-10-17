'use client'

import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { formatCOP } from '@/lib/utils/pos-utils'
import { CustomerDTO } from '@/lib/types'

interface CustomerCreditInfo {
  enabled: boolean
  limit: number
  balance: number
  status: 'AL_DIA' | 'EN_MORA' | 'BLOQUEADO'
}

interface ConfirmMoraModalProps {
  open: boolean
  customer: CustomerDTO
  creditInfo: CustomerCreditInfo
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmMoraModal({ open, customer, creditInfo, onClose, onConfirm }: ConfirmMoraModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="CLIENTE CON MORA ACTIVA"
      icon={<AlertTriangle className="w-5 h-5" />}
      tone="danger"
      size="md"
    >
      <div className="bg-alert-dim border border-alert-line rounded p-3 space-y-2 text-[11px]">
        <div className="font-bold text-alert uppercase tracking-wider text-[10px]">
          ⚠ Advertencia — Cartera Vencida
        </div>
        <div className="text-fg">
          El cliente <strong>{customer.name}</strong> ({customer.documentType} {customer.documentNumber}) tiene{' '}
          <strong className="text-alert">crédito en mora</strong>.
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="bg-input p-2 rounded">
            <div className="text-[9px] text-fg-muted uppercase font-bold">Saldo pendiente</div>
            <div className="text-alert font-bold">
              {formatCOP(creditInfo.balance)}
            </div>
          </div>
          <div className="bg-input p-2 rounded">
            <div className="text-[9px] text-fg-muted uppercase font-bold">Cupo total</div>
            <div className="text-fg font-bold">
              {formatCOP(creditInfo.limit)}
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-fg-muted">
        ¿Deseas continuar con la venta de todos modos? La transacción se registrará como
        <span className="text-accent font-bold"> CONTADO </span>
        y el cliente seguirá en mora hasta que abone a su cuenta.
      </p>

      <div className="flex gap-2 pt-2 border-t border-line-dim">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 h-11 bg-raised border border-line text-fg-muted hover:text-fg font-bold uppercase tracking-wider rounded text-xs transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 h-11 bg-alert text-white font-bold uppercase tracking-wider rounded text-xs hover:bg-danger-solid transition-colors"
        >
          Continuar de todos modos
        </button>
      </div>
    </Modal>
  )
}
