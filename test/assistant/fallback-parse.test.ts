import { describe, expect, it } from 'vitest'
import { tryParseIntentFallback } from '@/lib/assistant/fallback-parse'

describe('tryParseIntentFallback', () => {
  it('parsea factura con y sin cantidad explícita', () => {
    const sinCantidad = tryParseIntentFallback('FACTURAR Agua Mineral Sin Gas 600ml')
    expect(sinCantidad?.type).toBe('CREATE_SALE')
    if (sinCantidad?.type === 'CREATE_SALE') {
      expect(sinCantidad.items[0].quantity).toBe(1)
      expect(sinCantidad.items[0].query).toMatch(/Agua Mineral/i)
    }

    const ok = tryParseIntentFallback('Factura 1 Agua Mineral Sin Gas 600ml')
    expect(ok?.type).toBe('CREATE_SALE')
    if (ok?.type === 'CREATE_SALE') {
      expect(ok.items[0].quantity).toBe(1)
      expect(ok.items[0].query).toMatch(/Agua Mineral/i)
      expect(ok.paymentMethod).toBe('CASH')
    }
  })

  it('parsea varios productos', () => {
    const ok = tryParseIntentFallback('Factura 2 pan, 1 leche cliente 1234567890')
    expect(ok?.type).toBe('CREATE_SALE')
    if (ok?.type === 'CREATE_SALE') {
      expect(ok.items).toHaveLength(2)
      expect(ok.items[0]).toMatchObject({ quantity: 2, query: expect.stringMatching(/pan/i) })
      expect(ok.items[1]).toMatchObject({ quantity: 1, query: expect.stringMatching(/leche/i) })
      expect(ok.customer?.documentNumber).toBe('1234567890')
    }
  })

  it('parsea cliente y pago único', () => {
    const ok = tryParseIntentFallback('Factura 2 pan cliente 1234567890 en nequi')
    expect(ok?.type).toBe('CREATE_SALE')
    if (ok?.type === 'CREATE_SALE') {
      expect(ok.items[0].quantity).toBe(2)
      expect(ok.customer?.documentNumber).toBe('1234567890')
      expect(ok.paymentMethod).toBe('NEQUI')
    }
  })

  it('parsea varios medios de pago', () => {
    const ok = tryParseIntentFallback('Factura 1 pan nequi 20000 efectivo resto')
    expect(ok?.type).toBe('CREATE_SALE')
    if (ok?.type === 'CREATE_SALE') {
      expect(ok.payments).toEqual([
        { method: 'NEQUI', amount: 20000 },
        { method: 'CASH' },
      ])
    }
  })

  it('parsea entrada y stock', () => {
    expect(tryParseIntentFallback('Entrada 10 arroz')?.type).toBe('INVENTORY_IN')
    expect(tryParseIntentFallback('Cuánto hay de azúcar')?.type).toBe('STOCK_QUERY')
  })
})
