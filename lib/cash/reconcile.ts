export type CashMovementType = 'INGRESO' | 'EGRESO' | 'RETIRO' | 'DEVOLUCION'

export interface CashReconciliationInput {
  openingBase: number
  cashSales: number
  cashIncome: number
  cashExpenses: number
  cashWithdrawals: number
  cashRefunds: number
}

export function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function cashMovementImpact(type: string, amount: number): number {
  const value = Math.abs(roundMoney(amount))
  switch (String(type || '').toUpperCase()) {
    case 'INGRESO':
      return value
    case 'EGRESO':
    case 'RETIRO':
    case 'DEVOLUCION':
      return -value
    default:
      return 0
  }
}

export function calculateExpectedCash(input: CashReconciliationInput): number {
  return roundMoney(
    input.openingBase +
      input.cashSales +
      input.cashIncome -
      input.cashExpenses -
      input.cashWithdrawals -
      input.cashRefunds
  )
}
