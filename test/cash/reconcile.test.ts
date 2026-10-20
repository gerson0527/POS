import { describe, expect, it } from 'vitest'
import {
  calculateExpectedCash,
  cashMovementImpact,
  roundMoney,
} from '@/lib/cash/reconcile'

describe('cash reconciliation', () => {
  it('sums cash sales and manual income, and subtracts cash outflows', () => {
    expect(
      calculateExpectedCash({
        openingBase: 50000,
        cashSales: 100000,
        cashIncome: 10000,
        cashExpenses: 5000,
        cashWithdrawals: 20000,
        cashRefunds: 3000,
      })
    ).toBe(132000)
  })

  it('uses positive amounts for every movement type', () => {
    expect(cashMovementImpact('INGRESO', 2500)).toBe(2500)
    expect(cashMovementImpact('EGRESO', 2500)).toBe(-2500)
    expect(cashMovementImpact('RETIRO', 2500)).toBe(-2500)
    expect(cashMovementImpact('DEVOLUCION', 2500)).toBe(-2500)
    expect(cashMovementImpact('DESCONOCIDO', 2500)).toBe(0)
  })

  it('rounds to cents', () => {
    expect(roundMoney(10.005)).toBe(10.01)
    expect(cashMovementImpact('INGRESO', -10.005)).toBe(10.01)
  })
})
