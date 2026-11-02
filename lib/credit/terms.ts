/** Día de pago por defecto si la empresa no tiene valor (o BD antigua). */
export const DEFAULT_CREDIT_TERM_DAYS = 15

/**
 * Rango permitido en configuración de empresa: día del mes (1 a 30).
 * El crédito vence ese mismo día del mes siguiente a la venta.
 */
export const CREDIT_TERM_DAYS_MIN = 1
export const CREDIT_TERM_DAYS_MAX = 30

export function normalizeCreditTermDays(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_CREDIT_TERM_DAYS
  return Math.min(CREDIT_TERM_DAYS_MAX, Math.max(CREDIT_TERM_DAYS_MIN, Math.floor(n)))
}

/**
 * Fecha de vencimiento de un cargo a crédito.
 *
 * El valor configurado es el día del mes en que se paga. Si se elige el día 5,
 * una venta hecha en noviembre vence el 5 de diciembre (mes siguiente), al
 * final de ese día. Si el mes siguiente no tiene ese día (ej. 30 en febrero),
 * vence el último día disponible del mes.
 */
export function computeCreditDueDate(
  dueDay: unknown,
  from: Date = new Date()
): Date {
  const day = normalizeCreditTermDays(dueDay)
  const year = from.getFullYear()
  const nextMonth = from.getMonth() + 1
  // Día 0 del mes posterior = último día del mes siguiente.
  const lastDayOfNextMonth = new Date(year, nextMonth + 1, 0).getDate()
  const targetDay = Math.min(day, lastDayOfNextMonth)
  return new Date(year, nextMonth, targetDay, 23, 59, 59, 999)
}
