import { describe, expect, it } from 'vitest'
import { calculateReturn, roundReturnMoney } from '@/lib/returns/calculate'

const item = {
  id: 'item-1',
  productId: 'prod-1',
  productName: 'Producto',
  quantity: 2,
  unitPrice: 5000,
  ivaRate: 19,
  ivaAmount: 1900,
  lineTotal: 11900,
}

describe('calculateReturn', () => {
  it('devuelve la mitad exacta de una venta gravada', () => {
    const result = calculateReturn({
      saleTotal: 11900,
      saleItems: [item],
      requestedItems: [{ saleItemId: item.id, quantity: 1 }],
    })

    expect(result.total).toBe(5950)
    expect(result.subtotal).toBe(5000)
    expect(result.taxAmount).toBe(950)
    expect(result.fullyReturnsSale).toBe(false)
  })

  it('al devolver todo reembolsa exactamente el total de la venta (incluye redondeo)', () => {
    const result = calculateReturn({
      saleTotal: 19000,
      saleItems: [{ ...item, lineTotal: 18950, ivaAmount: 1850 }],
      requestedItems: [{ saleItemId: item.id, quantity: 2 }],
    })

    expect(result.total).toBe(19000)
    expect(result.fullyReturnsSale).toBe(true)
    expect(roundReturnMoney(result.lines.reduce((sum, line) => sum + line.lineTotal, 0))).toBe(
      19000
    )
  })

  it('descuenta devoluciones anteriores y no permite superar el saldo de la venta', () => {
    const result = calculateReturn({
      saleTotal: 11900,
      saleItems: [item],
      requestedItems: [{ saleItemId: item.id, quantity: 1 }],
      alreadyReturned: [{ saleItemId: item.id, quantity: 1 }],
      previousReturnTotal: 5950,
    })

    expect(result.total).toBe(5950)
    expect(result.fullyReturnsSale).toBe(true)
  })

  it('rechaza cantidades por encima de lo disponible', () => {
    expect(() =>
      calculateReturn({
        saleTotal: 11900,
        saleItems: [item],
        requestedItems: [{ saleItemId: item.id, quantity: 3 }],
      })
    ).toThrow(/supera lo disponible/)
  })

  it('rechaza ítems que no pertenecen a la venta y cantidades inválidas', () => {
    expect(() =>
      calculateReturn({
        saleTotal: 11900,
        saleItems: [item],
        requestedItems: [{ saleItemId: 'otro', quantity: 1 }],
      })
    ).toThrow(/no pertenece/)

    expect(() =>
      calculateReturn({
        saleTotal: 11900,
        saleItems: [item],
        requestedItems: [{ saleItemId: item.id, quantity: 0 }],
      })
    ).toThrow(/mayores que cero/)
  })

  it('consolida líneas duplicadas del mismo ítem', () => {
    const result = calculateReturn({
      saleTotal: 11900,
      saleItems: [item],
      requestedItems: [
        { saleItemId: item.id, quantity: 0.5 },
        { saleItemId: item.id, quantity: 0.5 },
      ],
    })

    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].quantity).toBe(1)
    expect(result.total).toBe(5950)
  })

  it('aplica el descuento global de la venta al valor devuelto', () => {
    const result = calculateReturn({
      saleTotal: 10000,
      saleItems: [{ ...item, lineTotal: 11900 }],
      requestedItems: [{ saleItemId: item.id, quantity: 1 }],
    })

    expect(result.total).toBe(5000)
  })
})
