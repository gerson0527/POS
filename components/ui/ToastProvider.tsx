'use client'

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}

const TYPE_STYLES: Record<ToastType, string> = {
  success: 'bg-ok-dim border-ok-line text-success',
  error: 'bg-rose-surface-4 border-danger-border text-danger-fg',
  info: 'bg-panel border-line text-fg',
}

const TYPE_ICON = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = nextId.current++
    setItems((prev) => [...prev, { id, message, type }])
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 no-print pointer-events-none">
        {items.map((t) => {
          const Icon = TYPE_ICON[t.type]
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto max-w-md border p-3 rounded-[6px] flex items-center gap-3 animate-in fade-in duration-200 text-xs font-bold shadow-lg ${TYPE_STYLES[t.type]}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="min-w-0 break-words">{t.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
