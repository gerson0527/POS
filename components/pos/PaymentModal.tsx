'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Banknote, CheckCircle2, CreditCard, Layers, Plus, Smartphone, Wallet, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { SectionPanel } from '@/components/tactical/SectionPanel'
import { TacticalButton } from '@/components/tactical/TacticalButton'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { PaymentMethod } from '@/lib/types'
import { formatCOP } from '@/lib/utils/pos-utils'
import {
  PAYMENT_SPLIT_TOLERANCE,
  PaymentSplit,
  paymentRemaining,
  sumPaymentSplits,
  validatePaymentSplits,
} from '@/lib/utils/payment-splits'

const BASE_METHODS = [
  { method: PaymentMethod.CASH, label: 'EFECTIVO', short: 'EF', icon: Banknote },
  { method: PaymentMethod.NEQUI, label: 'NEQUI', short: 'NQ', icon: Smartphone },
  { method: PaymentMethod.CREDIT_CARD, label: 'T. CRÉDITO', short: 'CC', icon: CreditCard },
  { method: PaymentMethod.DEBIT_CARD, label: 'T. DÉBITO', short: 'TD', icon: CreditCard },
] as const

const STORE_CREDIT_METHOD = {
  method: PaymentMethod.STORE_CREDIT,
  label: 'CRÉDITO',
  short: 'CR',
  icon: Wallet,
} as const

/** Métodos sin comprobante/voucher (efectivo y crédito de cuenta corriente). */
function methodNeedsReference(method: PaymentMethod): boolean {
  return method !== PaymentMethod.CASH && method !== PaymentMethod.STORE_CREDIT
}

const REF_PLACEHOLDER: Record<string, string> = {
  [PaymentMethod.NEQUI]: 'Ej: M123456 / Ref Nequi',
  [PaymentMethod.CREDIT_CARD]: 'Ej: Voucher #987654 / Aprobación',
  [PaymentMethod.DEBIT_CARD]: 'Ej: Voucher #987654 / Aprobación',
  [PaymentMethod.TRANSFER]: 'Ej: Consecutivo transferencia',
}

function methodLabel(method: PaymentMethod): string {
  if (method === PaymentMethod.STORE_CREDIT) return 'CRÉDITO (CUENTA CORRIENTE)'
  return BASE_METHODS.find((m) => m.method === method)?.label ?? method
}

function referencePlaceholder(method: PaymentMethod): string {
  return REF_PLACEHOLDER[method] ?? 'Ej: Voucher #987654 / Aprobación'
}

interface SplitLine {
  id: string
  method: PaymentMethod
  amount: string
  reference: string
}

interface PaymentModalProps {
  open: boolean
  saleId: string | null
  total: number
  loading: boolean
  customerCredit?: { enabled: boolean; limit: number; balance: number; status: string } | null
  onBack: () => void
  onComplete: (payments: PaymentSplit[]) => void
}

export function PaymentModal({ open, saleId, total, loading, customerCredit, onBack, onComplete }: PaymentModalProps) {
  const [splitMode, setSplitMode] = useState(false)
  const [singleMethod, setSingleMethod] = useState<PaymentMethod>(PaymentMethod.CASH)
  const [singleReference, setSingleReference] = useState('')
  const [lines, setLines] = useState<SplitLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const nextIdRef = useRef(1)

  // Cupo disponible del cliente (infinito si el crédito no tiene límite definido).
  const availableCredit = useMemo(() => {
    if (!customerCredit?.enabled) return 0
    const limit = Number(customerCredit.limit || 0)
    const balance = Number(customerCredit.balance || 0)
    return limit > 0 ? Math.max(0, limit - balance) : Infinity
  }, [customerCredit])

  const creditAllowed =
    !!customerCredit?.enabled && customerCredit.status !== 'BLOQUEADO' && availableCredit > 0

  const methods = useMemo(
    () => (creditAllowed ? [...BASE_METHODS, STORE_CREDIT_METHOD] : BASE_METHODS),
    [creditAllowed]
  )

  // Al abrir (o cambiar el total), reinicia al modo pago único con EFECTIVO por el total.
  useEffect(() => {
    if (!open) return
    setSplitMode(false)
    setSingleMethod(PaymentMethod.CASH)
    setSingleReference('')
    setError(null)
    nextIdRef.current = 1
    setLines([{ id: 'l1', method: PaymentMethod.CASH, amount: String(total || 0), reference: '' }])
  }, [open, total])

  const splitPayments: PaymentSplit[] = lines.map((l) => ({
    method: l.method,
    amount: Number(l.amount) || 0,
    reference: l.reference.trim() || undefined,
  }))

  const paid = splitMode ? sumPaymentSplits(splitPayments) : total
  const remaining = total - paid
  const remainingOk = Math.abs(remaining) <= PAYMENT_SPLIT_TOLERANCE

  function toggleSplitMode() {
    setError(null)
    if (!splitMode) {
      // Pago único → split: siembra con el método/referencia actuales.
      nextIdRef.current = 2
      setLines([{ id: 'l1', method: singleMethod, amount: String(total || 0), reference: singleReference }])
      setSplitMode(true)
    } else {
      // Split → pago único: conserva el primer medio configurado.
      const first = lines[0]
      if (first) {
        setSingleMethod(first.method)
        setSingleReference(first.reference)
      }
      setSplitMode(false)
    }
  }

  function addLine() {
    const rem = paymentRemaining(splitPayments, total)
    const used = new Set(lines.map((l) => l.method))
    const nextMethod = methods.find((m) => !used.has(m.method))?.method ?? PaymentMethod.CASH
    setLines((prev) => [
      ...prev,
      {
        id: `l${nextIdRef.current++}`,
        method: nextMethod,
        amount: rem > 0 ? String(rem) : '0',
        reference: '',
      },
    ])
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)))
  }

  function setLineMethod(id: string, method: PaymentMethod) {
    setLines((prev) =>
      prev.map((l) =>
        l.id === id ? { ...l, method, reference: methodNeedsReference(method) ? l.reference : '' } : l
      )
    )
  }

  function setLineAmount(id: string, amount: string) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, amount } : l)))
  }

  function setLineReference(id: string, reference: string) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, reference } : l)))
  }

  function handleConfirm() {
    const payments: PaymentSplit[] = splitMode
      ? splitPayments
      : [{ method: singleMethod, amount: total, reference: singleReference.trim() || undefined }]
    const result = validatePaymentSplits(payments, total)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const creditTotal = payments
      .filter((p) => p.method === PaymentMethod.STORE_CREDIT)
      .reduce((sum, p) => sum + p.amount, 0)
    if (creditTotal > 0) {
      if (!creditAllowed) {
        setError('El cliente no tiene crédito disponible.')
        return
      }
      if (availableCredit !== Infinity && creditTotal > availableCredit + PAYMENT_SPLIT_TOLERANCE) {
        setError(
          `El monto a crédito (${formatCOP(creditTotal)}) supera el cupo disponible (${formatCOP(availableCredit)}).`
        )
        return
      }
    }
    setError(null)
    onComplete(payments)
  }

  return (
    <Modal bare size="lg" open={open} onClose={onBack}>
      <SectionPanel
        title="PASO 2: PROCESAMIENTO DE PAGO TÁCTICO"
        subtitle={`ORDEN NO: ${saleId || 'PENDIENTE'}`}
        statusSlot={
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-accent" />
            <button
              type="button"
              onClick={onBack}
              className="text-fg-muted hover:text-fg transition-colors"
              title="Cerrar modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        }
        contentClassName="space-y-5 p-6"
      >
        {/* Total Display */}
        <div className="bg-surface border border-accent/40 rounded p-5 text-center space-y-1">
          <span className="font-mono text-xs text-fg-muted uppercase tracking-wider">
            TOTAL A LIQUIDAR CON IMPUESTOS
          </span>
          <div className="font-mono text-3xl font-bold text-accent">{formatCOP(total)}</div>
        </div>

        {/* Selector de método / editor de split */}
        <div className="space-y-3 font-mono text-xs">
          <Label className="text-fg text-[11px]">
            {splitMode ? 'MEDIOS DE PAGO (SPLIT — VARIOS MÉTODOS)' : 'SELECCIONAR MÉTODO DE PAGO'}
          </Label>

          {!splitMode ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {methods.map((item) => {
                const Icon = item.icon
                const isSelected = singleMethod === item.method
                return (
                  <button
                    key={item.method}
                    type="button"
                    onClick={() => {
                      setSingleMethod(item.method)
                      if (!methodNeedsReference(item.method)) setSingleReference('')
                      setError(null)
                    }}
                    className={`p-3 rounded border font-mono text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-accent text-white border-accent shadow-lg scale-[1.02]'
                        : 'bg-surface text-fg-muted border-line hover:border-line-strong hover:text-fg'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[11px] uppercase tracking-tighter">{item.label}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div
                  key={line.id}
                  className="bg-surface border border-line rounded p-2.5 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-fg-muted uppercase tracking-wider">
                      PAGO #{idx + 1}
                    </span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="text-fg-muted hover:text-danger transition-colors cursor-pointer"
                        title="Quitar este medio de pago"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex gap-1">
                      {methods.map((m) => (
                        <button
                          key={m.method}
                          type="button"
                          title={m.label}
                          onClick={() => setLineMethod(line.id, m.method)}
                          className={`w-9 h-9 rounded border font-mono text-[10px] font-bold transition-all cursor-pointer ${
                            line.method === m.method
                              ? 'bg-accent text-white border-accent'
                              : 'bg-veil text-fg-muted border-line hover:border-line-strong hover:text-fg'
                          }`}
                        >
                          {m.short}
                        </button>
                      ))}
                    </div>

                    <div className="flex-1 min-w-[120px]">
                      <Input
                        type="number"
                        min={0}
                        placeholder="MONTO"
                        value={line.amount}
                        onChange={(e) => setLineAmount(line.id, e.target.value)}
                        className="bg-veil px-3 py-2 font-mono text-xs outline-none font-bold"
                      />
                    </div>
                  </div>

                  {methodNeedsReference(line.method) && (
                    <Input
                      type="text"
                      placeholder={referencePlaceholder(line.method)}
                      value={line.reference}
                      onChange={(e) => setLineReference(line.id, e.target.value)}
                      className="bg-veil px-3 py-2 font-mono text-xs outline-none uppercase"
                    />
                  )}

                  <span className="block text-[10px] text-fg-muted uppercase">
                    {methodLabel(line.method)}
                    {methodNeedsReference(line.method) && !line.reference.trim() ? ' — VOUCHER REQUERIDO' : ''}
                  </span>
                </div>
              ))}

              <button
                type="button"
                onClick={addLine}
                className="w-full py-2 rounded border border-dashed border-line-strong text-fg-muted hover:text-fg hover:border-accent transition-colors font-mono text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar otro medio de pago
              </button>
            </div>
          )}

          {/* Reference / Voucher Input (modo pago único) */}
          {!splitMode && methodNeedsReference(singleMethod) && (
            <div className="bg-input p-3 rounded border border-accent/40 space-y-1.5">
              <Label className="text-accent">
                ID DE TRANSFERENCIA / N° DE COMPROBANTE (VOUCHER) *
              </Label>
              <Input
                type="text"
                required
                placeholder={referencePlaceholder(singleMethod)}
                value={singleReference}
                onChange={(e) => {
                  setSingleReference(e.target.value)
                  setError(null)
                }}
                className="bg-veil px-3 py-2 font-mono text-xs outline-none uppercase font-bold"
              />
              <p className="text-[9px] text-fg-muted">
                * Obligatorio para auditar pagos digitales y conciliar el reporte de caja.
              </p>
            </div>
          )}

          {/* Toggle pago único ↔ split */}
          {creditAllowed && (
            <p className="text-[10px] text-fg-muted">
              Crédito disponible del cliente:{' '}
              <span className="text-success font-bold">
                {availableCredit === Infinity ? 'sin límite' : formatCOP(availableCredit)}
              </span>
            </p>
          )}

          <button
            type="button"
            onClick={toggleSplitMode}
            className="w-full py-2 rounded border border-line bg-veil text-fg-muted hover:text-fg hover:border-accent transition-colors font-mono text-[11px] font-bold uppercase flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5" />
            {splitMode
              ? '← Volver a pago único'
              : '¿Paga con varios medios? Activar pago múltiple (split)'}
          </button>
        </div>

        {/* Totales del pago */}
        <div className="bg-surface border border-line rounded p-3 font-mono text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-fg-muted uppercase">TOTAL:</span>
            <span className="font-bold">{formatCOP(total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted uppercase">PAGADO:</span>
            <span className="font-bold">{formatCOP(paid)}</span>
          </div>
          <div className="flex justify-between border-t border-line-soft pt-1">
            <span className="text-fg-muted uppercase">RESTANTE:</span>
            <span className={`font-bold ${remainingOk ? 'text-success' : 'text-danger'}`}>
              {formatCOP(Math.max(0, remaining))}
              {!remainingOk && remaining < 0 ? ' (EXCEDE EL TOTAL)' : ''}
            </span>
          </div>
        </div>

        {error && (
          <p className="font-mono text-[11px] text-danger bg-danger-bg border border-danger-line rounded px-3 py-2">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="space-y-2.5 pt-3 border-t border-line-soft">
          <TacticalButton
            variant="primary"
            size="md"
            className="w-full justify-center"
            loading={loading}
            onClick={handleConfirm}
            icon={<CheckCircle2 className="w-4 h-4" />}
          >
            {splitMode ? 'CONFIRMAR PAGOS Y EMITIR FACTURA' : 'CONFIRMAR PAGO Y EMITIR FACTURA'}
          </TacticalButton>

          <TacticalButton
            variant="secondary"
            size="sm"
            className="w-full justify-center"
            onClick={onBack}
          >
            REGRESAR AL CARRITO
          </TacticalButton>
        </div>
      </SectionPanel>
    </Modal>
  )
}
