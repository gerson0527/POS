import { describe, expect, it } from 'vitest'
import { PaymentMethod } from '@/lib/types'
import {
  PAYMENT_SPLIT_TOLERANCE,
  PaymentSplit,
  categorizeInvoicePayment,
  paymentRemaining,
  sumPaymentSplits,
  validatePaymentSplits,
} from '@/lib/utils/payment-splits'

const cash = (amount: number): PaymentSplit => ({ method: PaymentMethod.CASH, amount })
const nequi = (amount: number, reference: string): PaymentSplit => ({
  method: PaymentMethod.NEQUI,
  amount,
  reference,
})

describe('sumPaymentSplits / paymentRemaining', () => {
  it('suma los montos y calcula el restante', () => {
    const payments = [cash(100000), nequi(125000, 'M123')]
    expect(sumPaymentSplits(payments)).toBe(225000)
    expect(paymentRemaining(payments, 225000)).toBe(0)
    expect(paymentRemaining(payments, 300000)).toBe(75000)
  })

  it('ignora montos no numéricos en la suma', () => {
    expect(sumPaymentSplits([{ method: PaymentMethod.CASH, amount: NaN }])).toBe(0)
  })
})

describe('validatePaymentSplits', () => {
  it('pago único en efectivo por el total exacto: ok', () => {
    expect(validatePaymentSplits([cash(225000)], 225000)).toEqual({ ok: true })
  })

  it('split mixto que cubre el total: ok', () => {
    const payments = [cash(125000), nequi(100000, 'M987654')]
    expect(validatePaymentSplits(payments, 225000)).toEqual({ ok: true })
  })

  it('tolerancia de redondeo COP (±100): ok', () => {
    expect(validatePaymentSplits([cash(224950)], 225000).ok).toBe(true)
    expect(validatePaymentSplits([cash(225050)], 225000).ok).toBe(true)
    expect(PAYMENT_SPLIT_TOLERANCE).toBe(100)
  })

  it('rechaza lista vacía', () => {
    const r = validatePaymentSplits([], 225000)
    expect(r.ok).toBe(false)
  })

  it('rechaza montos en cero o negativos', () => {
    expect(validatePaymentSplits([cash(0)], 225000).ok).toBe(false)
    expect(validatePaymentSplits([cash(-5000)], 225000).ok).toBe(false)
  })

  it('rechaza medios digitales sin referencia/voucher', () => {
    const r = validatePaymentSplits([{ method: PaymentMethod.NEQUI, amount: 225000 }], 225000)
    expect(r).toEqual({ ok: false, error: 'Falta el voucher/referencia del pago #1.' })
  })

  it('identifica falta de pago más allá de la tolerancia', () => {
    const r = validatePaymentSplits([cash(100000)], 225000)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Falta por pagar')
  })

  it('identifica exceso de pago más allá de la tolerancia', () => {
    const r = validatePaymentSplits([cash(300000)], 225000)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('excede el total')
  })

  it('apunta al pago con error por índice (1-based)', () => {
    const r = validatePaymentSplits([cash(100000), { method: PaymentMethod.CREDIT_CARD, amount: 125000 }], 225000)
    expect(r).toEqual({ ok: false, error: 'Falta el voucher/referencia del pago #2.' })
  })
})

// Filtros/KPIs de /dashboard/invoices: getAllInvoices devuelve labels en
// español ('EFECTIVO', 'T. CRÉDITO', 'MIXTO (...)'), no los enums.
describe('categorizeInvoicePayment', () => {
  it('fila de pago en efectivo → CASH', () => {
    expect(categorizeInvoicePayment({ payments: [{ method: 'CASH' }], paymentMethod: 'EFECTIVO' })).toEqual({
      category: 'CASH',
      methodCount: 1,
    })
  })

  it('ventas viejas sin payments[] usan el label (EFECTIVO → CASH)', () => {
    expect(categorizeInvoicePayment({ payments: [], paymentMethod: 'EFECTIVO' }).category).toBe('CASH')
    expect(categorizeInvoicePayment({ payments: null, paymentMethod: 'EFECTIVO' }).category).toBe('CASH')
  })

  it('NEQUI puro → NEQUI; tarjetas (enum y label) → CARD', () => {
    expect(categorizeInvoicePayment({ payments: [{ method: 'NEQUI' }], paymentMethod: 'NEQUI' }).category).toBe(
      'NEQUI'
    )
    expect(
      categorizeInvoicePayment({ payments: [{ method: 'CREDIT_CARD' }], paymentMethod: 'T. CRÉDITO' }).category
    ).toBe('CARD')
    expect(
      categorizeInvoicePayment({ payments: [{ method: 'DEBIT_CARD' }], paymentMethod: 'T. DÉBITO' }).category
    ).toBe('CARD')
  })

  it('MIXTO con 4 filas (T. DÉBITO + NEQUI + EFECTIVO + T. CRÉDITO) → MIXED', () => {
    const inv = {
      payments: [{ method: 'DEBIT_CARD' }, { method: 'NEQUI' }, { method: 'CASH' }, { method: 'CREDIT_CARD' }],
      paymentMethod: 'MIXTO (T. DÉBITO + NEQUI + EFECTIVO + T. CRÉDITO)',
    }
    expect(categorizeInvoicePayment(inv)).toEqual({ category: 'MIXED', methodCount: 4 })
  })

  it('label MIXTO manda aunque falten filas de pago', () => {
    expect(categorizeInvoicePayment({ payments: [], paymentMethod: 'MIXTO (EFECTIVO + NEQUI)' }).category).toBe(
      'MIXED'
    )
  })

  it('transferencia u otros → OTHER', () => {
    expect(categorizeInvoicePayment({ payments: [{ method: 'TRANSFER' }], paymentMethod: 'TRANSFERENCIA' }).category).toBe(
      'OTHER'
    )
  })
})
