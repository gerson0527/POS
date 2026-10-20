'use client'

import { motion } from 'motion/react'
import { formatCOP } from '@/lib/utils/pos-utils'

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]

interface SaleSuccessOverlayProps {
  total: number
  dianStatus: 'success' | 'pending'
  cufe?: string
}

export function SaleSuccessOverlay({ total, dianStatus, cufe }: SaleSuccessOverlayProps) {
  return (
    <motion.div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4 no-print"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      <motion.div
        role="status"
        aria-live="polite"
        className="w-full max-w-sm rounded-lg border border-success-line bg-panel p-6 text-center shadow-2xl"
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 6 }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
      >
        <motion.div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-bg text-success"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 360, damping: 24 }}
        >
          <svg viewBox="0 0 52 52" className="h-14 w-14" aria-hidden="true">
            <motion.circle
              cx="26"
              cy="26"
              r="23"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              initial={{ pathLength: 0, opacity: 0.4 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            />
            <motion.path
              d="M15 27l7 7 16-17"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.18, duration: 0.28, ease: 'easeOut' }}
            />
          </svg>
        </motion.div>

        <h2 className="mt-4 font-mono text-sm font-bold uppercase tracking-wider text-fg">
          Venta completada
        </h2>
        <p className="mt-1 font-mono text-2xl font-bold text-accent">{formatCOP(total)}</p>

        <p
          className={`mt-3 inline-flex rounded border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide ${
            dianStatus === 'success'
              ? 'border-success-line bg-success-bg text-success-fg'
              : 'border-warn-bg-4 bg-warn-bg-2 text-warning'
          }`}
        >
          {dianStatus === 'success' ? 'Transmitida a DIAN' : 'Factura local creada · DIAN pendiente'}
        </p>

        {cufe && (
          <p className="mt-2 truncate font-mono text-[9px] text-fg-muted" title={cufe}>
            CUFE: {cufe}
          </p>
        )}

        <p className="mt-4 font-mono text-[10px] text-fg-muted">Preparando nueva venta...</p>
      </motion.div>
    </motion.div>
  )
}
