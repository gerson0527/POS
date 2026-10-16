import { describe, expect, it } from 'vitest'
import {
  dianTicketPayment,
  factusPaymentCode,
  posPaymentLabel,
} from '@/lib/catalogs/payment-methods'

describe('factusPaymentCode (vocabulario Factus)', () => {
  it('tarjetas usan 48/49 y efectivo 10 (códigos enviados a /v2/bills)', () => {
    expect(factusPaymentCode('CASH')).toBe('10')
    expect(factusPaymentCode('CARD')).toBe('48')
    expect(factusPaymentCode('CREDIT_CARD')).toBe('48')
    expect(factusPaymentCode('DEBIT_CARD')).toBe('49')
    expect(factusPaymentCode('NEQUI')).toBe('47')
    expect(factusPaymentCode('BONOS')).toBe('71')
    expect(factusPaymentCode('desconocido')).toBe('10')
    expect(factusPaymentCode('')).toBe('10')
  })
})

describe('dianTicketPayment (vocabulario del ticket)', () => {
  it('tarjetas usan 20/30 y Nequi va como transferencia 42 (impresión)', () => {
    expect(dianTicketPayment('CASH')).toEqual({ code: '10', label: 'Efectivo', reference: undefined })
    expect(dianTicketPayment('CREDIT_CARD').code).toBe('30')
    expect(dianTicketPayment('TARJETA_DEBITO').code).toBe('20')
    expect(dianTicketPayment('NEQUI')).toEqual({
      code: '42',
      label: 'Nequi (transferencia)',
      reference: undefined,
    })
    expect(dianTicketPayment('TRANSFERENCIA', 'REF-9')).toEqual({
      code: '42',
      label: 'Transferencia electrónica',
      reference: 'REF-9',
    })
  })

  it('método desconocido → ZZ con el valor crudo como label', () => {
    expect(dianTicketPayment('BITCOIN')).toEqual({
      code: 'ZZ',
      label: 'BITCOIN',
      reference: undefined,
    })
    expect(dianTicketPayment(undefined).code).toBe('ZZ')
  })
})

describe('posPaymentLabel (vocabulario de la UI)', () => {
  it('etiquetas cortas canónicas', () => {
    expect(posPaymentLabel('CASH')).toBe('EFECTIVO')
    expect(posPaymentLabel('EFECTIVO')).toBe('EFECTIVO')
    expect(posPaymentLabel('NEQUI')).toBe('NEQUI')
    expect(posPaymentLabel('TRANSFER')).toBe('TRANSFERENCIA')
    expect(posPaymentLabel('CREDIT_CARD')).toBe('T. CRÉDITO')
    expect(posPaymentLabel('DEBIT_CARD')).toBe('T. DÉBITO')
    expect(posPaymentLabel('SIN_TARJETA')).toBe('SIN_TARJETA')
  })
})

describe('vocabularios NO intercambiables (regla de oro)', () => {
  it('la misma clave POS produce códigos distintos según el vocabulario', () => {
    // Factus envía 48 (CRÉDITO) al DIAN; el ticket imprime 30. Es intencional.
    expect(factusPaymentCode('CREDIT_CARD')).toBe('48')
    expect(dianTicketPayment('CREDIT_CARD').code).toBe('30')
    expect(factusPaymentCode('DEBIT_CARD')).toBe('49')
    expect(dianTicketPayment('DEBIT_CARD').code).toBe('20')
    expect(factusPaymentCode('NEQUI')).toBe('47')
    expect(dianTicketPayment('NEQUI').code).toBe('42')
  })
})
