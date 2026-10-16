'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { formatCOP } from '@/lib/utils/pos-utils'

interface NumberPromptModalProps {
  open: boolean
  onClose: () => void
  title: string
  icon?: ReactNode
  description?: string
  label: string
  defaultValue?: string
  hint?: string
  confirmLabel?: string
  onConfirm: (amount: number) => void
}

/**
 * Reemplazo del prompt() nativo del navegador: modal centrado con input
 * numérico, vista previa en COP y validación (entero >= 0).
 */
export function NumberPromptModal({
  open,
  onClose,
  title,
  icon,
  description,
  label,
  defaultValue = '',
  hint,
  confirmLabel = 'CONFIRMAR',
  onConfirm,
}: NumberPromptModalProps) {
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    if (open) setValue(defaultValue)
  }, [open, defaultValue])

  const parsed = Number(value)
  const isValid = value.trim() !== '' && Number.isInteger(parsed) && parsed >= 0

  function handleConfirm() {
    if (!isValid) return
    onConfirm(parsed)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={title} icon={icon} size="md">
      <div className="space-y-4">
        {description && <p className="font-mono text-xs text-fg-muted leading-relaxed">{description}</p>}

        <div className="space-y-1.5">
          <Label className="text-accent text-[11px]">{label}</Label>
          <Input
            type="text"
            inputMode="numeric"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm()
            }}
            placeholder="0"
            className="bg-veil px-3 py-2.5 font-mono text-sm outline-none font-bold"
          />
          {isValid && (
            <p className="font-mono text-[11px] text-success font-bold">{formatCOP(parsed)}</p>
          )}
          {hint && <p className="font-mono text-[10px] text-fg-muted">{hint}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-line-soft">
          <TacticalButton variant="secondary" size="sm" onClick={onClose}>
            CANCELAR
          </TacticalButton>
          <TacticalButton
            variant="primary"
            size="sm"
            disabled={!isValid}
            onClick={handleConfirm}
            icon={<CheckCircle2 className="w-3.5 h-3.5" />}
          >
            {confirmLabel}
          </TacticalButton>
        </div>
      </div>
    </Modal>
  )
}
