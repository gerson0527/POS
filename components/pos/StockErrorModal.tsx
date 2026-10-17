'use client'

import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import type { StockErrorState } from '@/lib/hooks/use-cart'

interface StockErrorModalProps {
  error: StockErrorState
  onClose: () => void
  onForceAdd: () => void
}

export function StockErrorModal({ error, onClose, onForceAdd }: StockErrorModalProps) {
  return (
    <Modal
      open={!!error}
      onClose={onClose}
      title={
        <>
          {error.title}
          <span className="block text-[10px] text-fg-muted font-mono font-normal mt-1">
            CONTROL DE INVENTARIO EN TIEMPO REAL
          </span>
        </>
      }
      icon={<AlertTriangle className="w-6 h-6 shrink-0" />}
      tone="danger"
      size="md"
    >
      <p className="font-mono text-xs text-fg leading-relaxed">
        {error.message}
      </p>

      <div className="bg-rose-surface border border-danger-bg rounded p-3 text-[11px] font-mono text-red-soft space-y-1">
        <p className="font-bold text-xs text-alert">• NOTA DE CONTROL:</p>
        <p>El sistema impide la facturación de artículos sin existencias para evitar descuadres en el inventario físico.</p>
        {error.availableStock !== undefined && (
          <p className="text-accent font-bold">Unidades disponibles en tienda: {error.availableStock}</p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2 border-t border-line-soft">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 bg-night-mid-2 hover:bg-line-dim text-fg-muted hover:text-fg rounded font-mono text-xs transition-colors"
        >
          CANCELAR / DENEGAR
        </button>
        <button
          type="button"
          onClick={onForceAdd}
          className="w-full sm:w-auto px-4 py-2 bg-accent hover:bg-warn-solid text-white font-mono font-bold rounded text-xs transition-colors flex items-center justify-center gap-1 shadow-lg"
        >
          <span>CONTINUAR VENTA SIN STOCK</span>
          <span>&gt;</span>
        </button>
      </div>
    </Modal>
  )
}
