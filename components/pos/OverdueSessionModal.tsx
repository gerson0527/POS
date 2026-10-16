'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'

interface OverdueSessionInfo {
  isOverdue: boolean
  daysOverdue: number
  openedAt: string
  sessionId: string
}

interface OverdueSessionModalProps {
  open: boolean
  info: OverdueSessionInfo
  onClose: () => void
}

export function OverdueSessionModal({ open, info, onClose }: OverdueSessionModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <>
          ALERTA DE SEGURIDAD // TURNO VENCIDO SIN CERRAR
          <span className="block text-[10px] text-fg-muted font-mono font-normal mt-1">
            AUDITORÍA Y ARQUEO DIARIO DE CAJA
          </span>
        </>
      }
      icon={<AlertTriangle className="w-6 h-6 shrink-0" />}
      tone="danger"
      size="md"
    >
      <p className="font-mono text-xs text-fg leading-relaxed">
        El sistema detectó que la sesión de caja <span className="text-accent font-bold">#{info.sessionId}</span> fue aperturada el <span className="font-bold text-white">{info.openedAt}</span> (hace {info.daysOverdue} día/s) y <span className="text-alert font-bold">NO FUE CERRADA AL FINALIZAR LA JORNADA</span>.
      </p>

      <div className="bg-rose-surface border border-danger-bg rounded p-3 text-[11px] font-mono text-red-soft space-y-1.5">
        <p className="font-bold text-xs text-alert">• ACCIÓN RECOMENDADA:</p>
        <p>1. Ingrese al módulo de Arqueo y Cierre de Caja.</p>
        <p>2. Digite el dinero contado en efectivo para generar el Reporte Z de esa jornada.</p>
        <p>3. Abra el nuevo turno correspondiente al día de hoy.</p>
      </div>

      <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2 border-t border-line-soft">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 bg-night-mid-2 hover:bg-line-dim text-fg-muted hover:text-white rounded font-mono text-xs transition-colors"
        >
          ENTENDIDO (CONTINUAR)
        </button>
        <Link href="/dashboard/cash-closure">
          <button
            type="button"
            className="w-full sm:w-auto px-4 py-2 bg-alert hover:bg-danger-solid text-black font-bold rounded font-mono text-xs transition-colors flex items-center justify-center gap-1"
          >
            <span>IR A CIERRE DE CAJA AHORA</span>
            <span>&gt;</span>
          </button>
        </Link>
      </div>
    </Modal>
  )
}
