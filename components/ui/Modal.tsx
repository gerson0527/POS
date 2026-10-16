'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
}

const TONE_BORDER = {
  default: 'border-accent',
  danger: 'border-alert',
} as const

const TONE_TEXT = {
  default: 'text-accent',
  danger: 'text-alert',
} as const

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'danger'
  size?: ModalSize
  scroll?: boolean
  bare?: boolean
  actions?: ReactNode
  children?: ReactNode
}

export function Modal({
  open,
  onClose,
  title,
  icon,
  tone = 'default',
  size = 'md',
  scroll = true,
  bare = false,
  actions,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null)
      if (focusables.length === 0) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    const timer = window.setTimeout(() => {
      const panel = panelRef.current
      const target = panel?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button'
      )
      target?.focus()
    }, 30)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      window.clearTimeout(timer)
    }
  }, [open, onClose])

  if (!open) return null

  const ariaLabel = typeof title === 'string' ? title : undefined
  const panelClass = bare
    ? `w-full ${SIZE_CLASS[size]} shadow-2xl${scroll ? ' max-h-[90vh] overflow-y-auto' : ''}`
    : `bg-veil border ${TONE_BORDER[tone]} rounded-lg w-full ${SIZE_CLASS[size]} p-6 space-y-4 shadow-2xl${
        scroll ? ' max-h-[90vh] overflow-y-auto' : ''
      }`

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div ref={panelRef} className={panelClass}>
        {(title || icon || actions) && (
          <div className="flex items-center justify-between border-b border-line-dim pb-3">
            <div className={`flex items-center gap-2 font-bold text-sm ${TONE_TEXT[tone]}`}>
              {icon}
              {title && <span>{title}</span>}
            </div>
            <div className="flex items-center gap-2">
              {actions}
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="text-fg-muted hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
