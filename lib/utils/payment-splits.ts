// payment-splits.ts — Reglas puras de pago único/múltiple (split) del POS.
// El backend completeSale valida |suma(payments) - total| <= 100 (redondeo COP)
// y exige referencia para medios digitales; aquí se replica para la UI.

import { PaymentMethod } from '@/lib/types'

export interface PaymentSplit {
  method: PaymentMethod
  amount: number
  reference?: string
}

/** Tolerancia del backend (roundToNearest100) en completeSale. */
export const PAYMENT_SPLIT_TOLERANCE = 100

export function sumPaymentSplits(payments: PaymentSplit[]): number {
  return payments.reduce((sum, p) => sum + (Number.isFinite(p.amount) ? p.amount : 0), 0)
}

export function paymentRemaining(payments: PaymentSplit[], total: number): number {
  return total - sumPaymentSplits(payments)
}

export function validatePaymentSplits(
  payments: PaymentSplit[],
  total: number
): { ok: true } | { ok: false; error: string } {
  if (payments.length === 0) {
    return { ok: false, error: 'Debe haber al menos un medio de pago.' }
  }
  for (let i = 0; i < payments.length; i++) {
    const p = payments[i]
    if (!Number.isFinite(p.amount) || p.amount <= 0) {
      return { ok: false, error: `El monto del pago #${i + 1} debe ser mayor a cero.` }
    }
    if (p.method !== PaymentMethod.CASH && !String(p.reference ?? '').trim()) {
      return { ok: false, error: `Falta el voucher/referencia del pago #${i + 1}.` }
    }
  }
  const remaining = paymentRemaining(payments, total)
  if (Math.abs(remaining) > PAYMENT_SPLIT_TOLERANCE) {
    return {
      ok: false,
      error:
        remaining > 0
          ? `Falta por pagar $${remaining.toLocaleString('es-CO')}.`
          : `El pago excede el total en $${Math.abs(remaining).toLocaleString('es-CO')}.`,
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Clasificación de facturas para filtros/KPIs de /dashboard/invoices.
// getAllInvoices devuelve `paymentMethod` como LABEL en español
// ('EFECTIVO', 'T. CRÉDITO', 'MIXTO (...)'), no el enum ('CASH', ...).
// Las filas de `payments[]` (enum crudo) mandan; el label es fallback de
// ventas viejas sin filas de pago.
// ---------------------------------------------------------------------------

export type InvoicePaymentCategory = 'CASH' | 'NEQUI' | 'CARD' | 'MIXED' | 'OTHER'

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
}

/** Label en español (u otro texto) → código(s) enum equivalentes. */
function labelToMethodCodes(label: string): string[] {
  if (!label || label.includes('MIXTO')) return []
  const plain = stripAccents(label)
  if (plain.includes('EFECTIVO')) return ['CASH']
  if (plain.includes('NEQUI')) return ['NEQUI']
  if (plain.includes('TRANSFERENCIA') || plain.includes('TRANSFER')) return ['TRANSFER']
  if (plain.includes('CREDITO') || plain.includes('CREDIT')) return ['CREDIT_CARD']
  if (plain.includes('DEBITO') || plain.includes('DEBIT')) return ['DEBIT_CARD']
  return [label]
}

export function categorizeInvoicePayment(inv: {
  payments?: { method?: string | null }[] | null
  paymentMethod?: string | null
}): { category: InvoicePaymentCategory; methodCount: number } {
  const rawMethods = (inv.payments ?? [])
    .map((p) => String(p.method ?? '').trim().toUpperCase())
    .filter(Boolean)
  const label = stripAccents(String(inv.paymentMethod ?? ''))

  const methods = rawMethods.length > 0 ? rawMethods : labelToMethodCodes(label)
  const isMixed = label.includes('MIXTO') || methods.length > 1

  if (isMixed) {
    return { category: 'MIXED', methodCount: Math.max(methods.length, 2) }
  }

  const m = methods[0] ?? ''
  if (!m || m === 'CASH' || m === 'EFECTIVO') {
    return { category: 'CASH', methodCount: methods.length || 1 }
  }
  if (m === 'NEQUI') return { category: 'NEQUI', methodCount: 1 }
  if (
    m === 'CREDIT_CARD' ||
    m === 'DEBIT_CARD' ||
    m === 'CARD' ||
    m === 'T. CREDITO' ||
    m === 'T. DEBITO'
  ) {
    return { category: 'CARD', methodCount: 1 }
  }
  return { category: 'OTHER', methodCount: 1 }
}
