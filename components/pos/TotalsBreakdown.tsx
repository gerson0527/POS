'use client'

import { motion } from 'motion/react'
import { formatCOP } from '@/lib/utils/pos-utils'

interface TotalsBreakdownProps {
  totals: {
    subtotal: number
    taxAmount: number
    discountAmount: number
    total: number
  }
  discount: number
}

export function TotalsBreakdown({ totals, discount }: TotalsBreakdownProps) {
  return (
    <div className="shrink-0 bg-surface border border-line rounded p-3 font-mono text-xs space-y-1.5">
      <div className="flex justify-between text-fg-muted text-[11px]">
        <span>SUBTOTAL:</span>
        <span>{formatCOP(totals.subtotal)}</span>
      </div>
      <div className="flex justify-between text-fg-muted text-[11px]">
        <span>IVA (19% IMPUESTO):</span>
        <span>{formatCOP(totals.taxAmount)}</span>
      </div>
      {discount > 0 && (
        <div className="flex justify-between text-warning text-[11px]">
          <span>DESCUENTO ({discount}%):</span>
          <span>-{formatCOP(totals.discountAmount)}</span>
        </div>
      )}
      <div className="flex justify-between items-center text-sm font-bold text-fg pt-1.5 border-t border-line">
        <span>TOTAL:</span>
        <motion.span
          key={totals.total}
          initial={{ opacity: 0.5, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="text-accent inline-block"
        >
          {formatCOP(totals.total)}
        </motion.span>
      </div>
    </div>
  )
}
