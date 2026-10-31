// lib/db/doctor.ts
// Lógica pura del diagnóstico de base de datos (sin acceso a Postgres, para poder testearla).
// El script que conecta y muestra el informe vive en scripts/db-doctor.ts.
//
// Responde tres preguntas antes de arrancar la app:
//   1. ¿A qué base de datos estoy apuntando (local/pruebas vs remota/producción)?
//   2. ¿Quedan migraciones de drizzle sin aplicar?
//   3. ¿El esquema Drizzle coincide con las tablas/columnas reales?

export type JournalEntry = {
  idx: number
  tag: string
  when: number
  hash: string
}

export type AppliedMigration = {
  id: number
  hash: string
  created_at: number | string
}

export type MigrationPlan = {
  pending: JournalEntry[]
  /** Migraciones aplicadas cuya huella no corresponde a ningún archivo del journal. */
  unknown: AppliedMigration[]
  /** Migraciones ya aplicadas cuyo archivo cambió después de aplicarse. */
  modified: JournalEntry[]
  upToDate: boolean
}

/**
 * Drizzle decide qué migraciones faltan comparando `created_at` contra el `when`
 * del journal (ver drizzle-orm/migrator), no comparando hashes. Aquí replicamos
 * ese criterio y además avisamos si un archivo aplicado fue modificado.
 */
export function buildMigrationPlan(
  journal: JournalEntry[],
  applied: AppliedMigration[]
): MigrationPlan {
  const ordered = [...journal].sort((a, b) => a.when - b.when)
  const appliedHashes = new Set(applied.map((m) => m.hash))
  const journalHashes = new Set(ordered.map((m) => m.hash))

  const lastAppliedWhen = applied.reduce((max, m) => Math.max(max, Number(m.created_at) || 0), 0)

  const pending = ordered.filter((entry) => entry.when > lastAppliedWhen)
  // drizzle decide por timestamp, no por hash: una migración "modificada" no impide
  // que la BD esté al día. Se reporta solo como aviso (archivo editado post-apply).
  const modified = ordered.filter(
    (entry) => entry.when <= lastAppliedWhen && !appliedHashes.has(entry.hash)
  )
  const unknown = applied.filter((m) => !journalHashes.has(m.hash))

  return {
    pending,
    unknown,
    modified,
    // upToDate se basa en lo que drizzle realmente considera (timestamps).
    upToDate: pending.length === 0,
  }
}

export type ExpectedTable = {
  name: string
  columns: string[]
}

export type DbColumnsByTable = Map<string, Set<string>>

export type SchemaDiff = {
  missingTables: string[]
  missingColumns: { table: string; columns: string[] }[]
  /** Columnas que existen en la BD pero no en el esquema (la BD va por delante del código). */
  extraColumns: { table: string; columns: string[] }[]
  ok: boolean
}

export function diffSchema(expected: ExpectedTable[], db: DbColumnsByTable): SchemaDiff {
  const missingTables: string[] = []
  const missingColumns: { table: string; columns: string[] }[] = []
  const extraColumns: { table: string; columns: string[] }[] = []

  for (const table of expected) {
    const dbColumns = db.get(table.name)
    if (!dbColumns) {
      missingTables.push(table.name)
      continue
    }
    const missing = table.columns.filter((column) => !dbColumns.has(column))
    if (missing.length > 0) missingColumns.push({ table: table.name, columns: missing })

    const expectedSet = new Set(table.columns)
    const extra = [...dbColumns].filter((column) => !expectedSet.has(column)).sort()
    if (extra.length > 0) extraColumns.push({ table: table.name, columns: extra })
  }

  return {
    missingTables,
    missingColumns,
    extraColumns,
    ok: missingTables.length === 0 && missingColumns.length === 0,
  }
}

export type DatabaseKind = 'local' | 'neon' | 'remote'

export type DatabaseInfo = {
  host: string
  database: string
  kind: DatabaseKind
  /** true cuando el host es localhost/127.0.0.1/::1. */
  isLocal: boolean
}

export function describeDatabase(rawUrl: string): DatabaseInfo {
  try {
    const url = new URL(rawUrl)
    const host = url.hostname || 'desconocido'
    const database = url.pathname.replace(/^\//, '') || 'desconocida'
    const isLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)
    const kind: DatabaseKind = isLocal ? 'local' : host.includes('neon.tech') ? 'neon' : 'remote'
    return { host, database, kind, isLocal }
  } catch {
    return { host: 'URL inválida', database: 'desconocida', kind: 'remote', isLocal: false }
  }
}
