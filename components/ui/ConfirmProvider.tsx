'use client'

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'
import { TacticalButton } from '@/components/tactical/TacticalButton'

export interface ConfirmOptions {
  title?: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>')
  return ctx
}

interface ConfirmState {
  options: ConfirmOptions
  resolve: (ok: boolean) => void
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setState({ options, resolve }))
  }, [])

  const settle = (ok: boolean) => {
    state?.resolve(ok)
    setState(null)
  }

  const tone = state?.options.tone ?? 'danger'

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => settle(false)}
        title={state?.options.title ?? 'CONFIRMAR ACCIÓN'}
        icon={<AlertTriangle className="w-4 h-4" />}
        tone={tone}
        size="md"
      >
        <div className="text-xs text-fg leading-relaxed">{state?.options.message}</div>
        <div className="flex justify-end gap-2 pt-3 border-t border-line-dim">
          <TacticalButton variant="secondary" size="sm" onClick={() => settle(false)}>
            {state?.options.cancelLabel ?? 'CANCELAR'}
          </TacticalButton>
          <TacticalButton
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={() => settle(true)}
          >
            {state?.options.confirmLabel ?? 'CONFIRMAR'}
          </TacticalButton>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  )
}
