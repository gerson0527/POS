// Helpers de formato de presentación (Fase 3.21 — §21 lib/utils/format).

/** Formatea un porcentaje con signo: 3.2 → "+3.2%", -1 → "-1.0%". */
export function formatTrend(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}
