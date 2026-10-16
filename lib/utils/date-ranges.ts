// Rangos de fechas compartidos (Fase 3.21 — §21 lib/utils/date-ranges).
// Extraído de reports/page.tsx y dashboard/page.tsx.

export type DatePreset =
  | 'today'
  | 'yesterday'
  | '7days'
  | '15days'
  | '30days'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'custom'
  | 'all'

export interface DateRange {
  preset: DatePreset
  start: string
  end: string
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function isoMinusDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

function isoFirstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function isoLastOfPrevMonth() {
  const d = new Date()
  d.setDate(0)
  return d.toISOString().split('T')[0]
}

function isoFirstOfPrevMonth() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function isoFirstOfYear() {
  return `${new Date().getFullYear()}-01-01`
}

export function computeRange(
  preset: DatePreset,
  customStart?: string,
  customEnd?: string
): { start: string; end: string } {
  switch (preset) {
    case 'today':
      return { start: todayISO(), end: todayISO() }
    case 'yesterday': {
      const y = isoMinusDays(1)
      return { start: y, end: y }
    }
    case '7days':
      return { start: isoMinusDays(6), end: todayISO() }
    case '15days':
      return { start: isoMinusDays(14), end: todayISO() }
    case '30days':
      return { start: isoMinusDays(29), end: todayISO() }
    case 'thisMonth':
      return { start: isoFirstOfMonth(), end: todayISO() }
    case 'lastMonth':
      return { start: isoFirstOfPrevMonth(), end: isoLastOfPrevMonth() }
    case 'thisYear':
      return { start: isoFirstOfYear(), end: todayISO() }
    case 'custom':
      return { start: customStart || isoFirstOfMonth(), end: customEnd || todayISO() }
    case 'all':
    default:
      return { start: '2000-01-01', end: todayISO() }
  }
}

export const PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: '7days', label: '7 días' },
  { id: '15days', label: '15 días' },
  { id: '30days', label: '30 días' },
  { id: 'thisMonth', label: 'Este mes' },
  { id: 'lastMonth', label: 'Mes anterior' },
  { id: 'thisYear', label: 'Este año' },
  { id: 'all', label: 'Todo' },
  { id: 'custom', label: 'Personalizado' },
]

/** Rango de día completo (00:00:00.000 → 23:59:59.999) como objetos Date. */
export function todayRange(): { start: Date; end: Date } {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  return { start, end }
}
