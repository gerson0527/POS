const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/

export interface MonthRange {
  from: string
  to: string
  start: Date
  end: Date
}

export function quoteIdent(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Identificador SQL no permitido: ${name}`)
  return `"${name}"`
}

export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return `'${value.toISOString()}'`
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return `'\\x${value.toString('hex')}'`
  }
  if (typeof value === 'object') {
    return `'${escapeSql(JSON.stringify(value))}'::jsonb`
  }
  return `'${escapeSql(String(value))}'`
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''")
}

export function parseMonthRange(from?: string | null, to?: string | null): MonthRange | null {
  const startMonth = String(from || '').trim()
  const endMonth = String(to || '').trim()
  if (!startMonth && !endMonth) return null
  if (!MONTH.test(startMonth) || !MONTH.test(endMonth)) {
    throw new Error('Seleccione el mes inicial y el mes final.')
  }
  if (startMonth > endMonth) {
    throw new Error('El mes inicial no puede ser posterior al mes final.')
  }

  const [startYear, startMonthNumber] = startMonth.split('-').map(Number)
  const [endYear, endMonthNumber] = endMonth.split('-').map(Number)
  const span = (endYear - startYear) * 12 + (endMonthNumber - startMonthNumber) + 1
  if (span > 120) {
    throw new Error('El rango de meses no puede superar 10 años.')
  }

  return {
    from: startMonth,
    to: endMonth,
    start: new Date(Date.UTC(startYear, startMonthNumber - 1, 1, 5, 0, 0)),
    end: new Date(Date.UTC(endYear, endMonthNumber, 1, 5, 0, 0)),
  }
}

export function backupFileName(range: MonthRange | null, now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10)
  if (!range) return `copia-pos-${stamp}.sql`
  return `copia-pos-${range.from}_${range.to}.sql`
}
