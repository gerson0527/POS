import { describe, expect, it } from 'vitest'
import { backupFileName, parseMonthRange, quoteIdent, sqlLiteral } from '@/lib/backup/sql'
import { resolveBackupTables } from '@/lib/backup/catalog'

describe('copia de seguridad', () => {
  it('escapa literales SQL', () => {
    expect(sqlLiteral(null)).toBe('NULL')
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'")
    expect(sqlLiteral(true)).toBe('TRUE')
    expect(quoteIdent('sale_item')).toBe('"sale_item"')
  })

  it('arma el rango de meses en hora de Bogotá', () => {
    const range = parseMonthRange('2026-01', '2026-03')
    expect(range?.start.toISOString()).toBe('2026-01-01T05:00:00.000Z')
    expect(range?.end.toISOString()).toBe('2026-04-01T05:00:00.000Z')
    expect(backupFileName(range, new Date('2026-11-04T12:00:00.000Z'))).toBe(
      'copia-pos-2026-01_2026-03.sql'
    )
  })

  it('rechaza tablas fuera del catálogo', () => {
    expect(() => resolveBackupTables('tables', ['sale', 'pg_shadow'])).toThrow(/no se puede incluir/)
    expect(resolveBackupTables('tables', ['sale']).map((table) => table.name)).toEqual(['sale'])
  })
})
