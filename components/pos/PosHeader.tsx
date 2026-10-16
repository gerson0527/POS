'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import { StatusBadge } from '@/components/tactical/StatusBadge'

interface PosHeaderProps {
  step: 'shopping' | 'payment' | 'complete'
}

export function PosHeader({ step }: PosHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-panel border border-line rounded-[6px] px-5 py-3 shrink-0">
      <div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-bold text-accent tracking-wider uppercase">
            MODULE // POS TERMINAL
          </span>
          <StatusBadge status="online" label="TERMINAL #01 ONLINE" />
        </div>
        <h1 className="font-mono text-lg font-bold text-fg tracking-tight uppercase mt-0.5">
          TERMINAL DE PUNTO DE VENTA
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/cashier"
          className="flex items-center gap-1.5 bg-warn-bg-2 hover:bg-accent text-accent hover:text-white border border-accent/40 px-3 py-1.5 rounded text-xs font-bold transition-colors"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>ARQUEO / CIERRE DE CAJA</span>
        </Link>

        <div className="hidden sm:flex items-center gap-2 font-mono text-xs">
          <div
            className={`px-3 py-1 rounded border text-[11px] ${
              step === 'shopping'
                ? 'bg-accent text-white border-accent font-bold'
                : 'bg-surface text-fg-muted border-line'
            }`}
          >
            01. CARRO
          </div>
          <span className="text-line-strong">&gt;</span>
          <div
            className={`px-3 py-1 rounded border text-[11px] ${
              step === 'payment'
                ? 'bg-accent text-white border-accent font-bold'
                : 'bg-surface text-fg-muted border-line'
            }`}
          >
            02. PAGO
          </div>
        </div>
      </div>
    </div>
  )
}
