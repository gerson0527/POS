import { pool } from '@/lib/db'
import type { BackupTable } from './catalog'
import { quoteIdent, sqlLiteral, type MonthRange } from './sql'

const BATCH = 200

export async function* exportBackupSql(options: {
  tenantId: string
  tables: BackupTable[]
  range: MonthRange | null
}): AsyncGenerator<string> {
  const { tenantId, tables, range } = options
  const exportedAt = new Date().toISOString()
  yield [
    '-- Copia de seguridad POS Retail',
    `-- Generada: ${exportedAt}`,
    `-- Empresa: ${tenantId}`,
    range
      ? `-- Meses: ${range.from} a ${range.to} (America/Bogota). Catálogo y maestros se exportan completos.`
      : '-- Meses: todos los registros',
    `-- Tablas: ${tables.map((table) => table.name).join(', ')}`,
    'BEGIN;',
    '',
  ].join('\n')

  for (const table of tables) {
    yield `-- ${table.label} (${table.name})\n`
    let exported = 0
    let lastId: string | null = null
    const columns = await tableColumns(table.name)
    if (!columns.length) {
      yield `-- Tabla no encontrada en la base de datos.\n\n`
      continue
    }
    if (!columns.includes('id')) {
      yield `-- La tabla no tiene columna id y se omitió.\n\n`
      continue
    }

    const columnSql = columns.map(quoteIdent).join(', ')
    while (true) {
      const { text, values } = buildSelect(table, columns, tenantId, range, lastId)
      const result = await pool.query(text, values)
      if (!result.rows.length) break

      const tuples = result.rows.map((row) => {
        const valuesSql = columns.map((column) => sqlLiteral(row[column])).join(', ')
        return `(${valuesSql})`
      })
      yield `INSERT INTO ${quoteIdent(table.name)} (${columnSql}) VALUES\n${tuples.join(',\n')};\n`
      exported += result.rows.length
      lastId = String(result.rows[result.rows.length - 1].id)
      if (result.rows.length < BATCH) break
    }
    yield `-- ${exported} fila(s)\n\n`
  }

  yield 'COMMIT;\n'
}

async function tableColumns(tableName: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  )
  return result.rows
    .map((row) => String(row.column_name))
    .filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
}

function buildSelect(
  table: BackupTable,
  columns: string[],
  tenantId: string,
  range: MonthRange | null,
  lastId: string | null
): { text: string; values: unknown[] } {
  const values: unknown[] = []
  const where: string[] = []

  values.push(tenantId)
  const tenantParam = `$${values.length}`
  where.push(tenantPredicate(table, tenantParam))

  if (range && table.dateFilter === 'range' && table.dateColumn && columns.includes(table.dateColumn)) {
    values.push(range.start)
    const startParam = `$${values.length}`
    values.push(range.end)
    const endParam = `$${values.length}`
    where.push(
      `${quoteIdent(table.dateColumn)} >= ${startParam} AND ${quoteIdent(table.dateColumn)} < ${endParam}`
    )
  }

  if (lastId) {
    values.push(lastId)
    where.push(`${quoteIdent('id')} > $${values.length}`)
  }

  values.push(BATCH)
  const text = `SELECT ${columns.map(quoteIdent).join(', ')} FROM ${quoteIdent(table.name)} WHERE ${where.join(' AND ')} ORDER BY ${quoteIdent('id')} LIMIT $${values.length}`
  return { text, values }
}

function tenantPredicate(table: BackupTable, tenantParam: string): string {
  const scope = table.tenant
  if (scope.kind === 'column') return `${quoteIdent(scope.column)} = ${tenantParam}`
  if (scope.kind === 'id') return `${quoteIdent('id')} = ${tenantParam}`
  if (scope.kind === 'users') {
    return `${quoteIdent('id')} IN (SELECT ${quoteIdent('userId')} FROM ${quoteIdent('user_tenant')} WHERE ${quoteIdent('tenantId')} = ${tenantParam})`
  }
  if (scope.kind === 'accounts') {
    return `${quoteIdent('userId')} IN (SELECT ${quoteIdent('userId')} FROM ${quoteIdent('user_tenant')} WHERE ${quoteIdent('tenantId')} = ${tenantParam})`
  }
  return `${quoteIdent(scope.childKey)} IN (SELECT ${quoteIdent(scope.parentKey)} FROM ${quoteIdent(scope.parent)} WHERE ${quoteIdent('tenantId')} = ${tenantParam})`
}
