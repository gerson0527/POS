// scripts/db-doctor.ts
// Diagnóstico de la base de datos ANTES de arrancar la app.
//
// Uso:
//   npm run db:doctor          -> falla (exit 1) si hay problemas
//   npm run db:doctor -- --soft -> solo avisa (exit 0), usado por `predev`
//
// Reporta:
//   - a qué BD se apunta (local/pruebas vs remota/producción)
//   - migraciones pendientes / archivos modificados
//   - diferencias entre el esquema Drizzle y la BD real
//   - resumen de datos (tenants, productos)

import dotenv from 'dotenv'
dotenv.config()

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { Pool } from 'pg'
import * as schema from '../lib/db/schema'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import {
  buildMigrationPlan,
  diffSchema,
  describeDatabase,
  type JournalEntry,
  type AppliedMigration,
  type ExpectedTable,
  type DbColumnsByTable,
} from '../lib/db/doctor'

const SOFT = process.argv.includes('--soft')
const VERBOSE = process.argv.includes('--verbose')

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle')

function readJournal(): JournalEntry[] {
  const journalPath = path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json')
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'))
  return (journal.entries as Array<{ idx: number; tag: string; when: number }>).map((e) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_FOLDER, `${e.tag}.sql`), 'utf8')
    return { idx: e.idx, tag: e.tag, when: e.when, hash: crypto.createHash('sha256').update(sql).digest('hex') }
  })
}

function collectExpectedTables(): ExpectedTable[] {
  const result: ExpectedTable[] = []
  for (const value of Object.values(schema)) {
    if (!(value instanceof PgTable)) continue
    const cfg = getTableConfig(value)
    result.push({
      name: cfg.name,
      columns: cfg.columns.map((c) => c.name),
    })
  }
  return result
}

function hr() {
  console.log('-'.repeat(60))
}

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || ''}@localhost:5432/${process.env.POSTGRES_DB || 'pruebas_POS'}`

  hr()
  console.log('DB DOCTOR - diagnostico de base de datos')
  hr()

  const info = describeDatabase(databaseUrl)
  console.log('\nEntorno / conexion')
  console.log(`   Host     : ${info.host}`)
  console.log(`   Base     : ${info.database}`)
  console.log(`   Tipo     : ${info.kind === 'local' ? 'LOCAL / PRUEBAS' : info.kind === 'neon' ? 'REMOTA (Neon)' : 'REMOTA'}`)
  if (info.kind === 'neon') {
    console.log('   [WARN] Apuntando a Neon (produccion/cloud). Verifica que sea intencional.')
  }
  if (info.kind === 'remote') {
    console.log('   [WARN] Base remota (no local).')
  }
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    console.log('   [WARN] NODE_ENV/VERCEL_ENV = production.')
  }

  const pool = new Pool({ connectionString: databaseUrl })
  let hasErrors = false

  try {
    await pool.query('SELECT 1')

    // --- Migraciones ---
    hr()
    console.log('\nMigraciones')
    const journal = readJournal()
    const reg = await pool.query(`SELECT to_regclass('drizzle.__drizzle_migrations') AS reg`)
    const migrationsTableExists = !!reg.rows[0]?.reg

    let applied: AppliedMigration[] = []
    if (migrationsTableExists) {
      const rows = await pool.query(`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`)
      applied = rows.rows.map((r) => ({ id: r.id, hash: r.hash, created_at: r.created_at }))
    } else {
      console.log('   [WARN] No existe drizzle.__drizzle_migrations (BD previa a drizzle).')
    }

    const plan = buildMigrationPlan(journal, applied)
    console.log(`   Aplicadas : ${applied.length} / ${journal.length}`)
    if (plan.pending.length > 0) {
      hasErrors = true
      console.log(`   [ERROR] Pendientes (${plan.pending.length}):`)
      for (const e of plan.pending) console.log(`      - ${e.tag}`)
    }
    if (VERBOSE && plan.modified.length > 0) {
      console.log(`   [info] Archivos editados despues de aplicarse (${plan.modified.length}): ${plan.modified.map((e) => e.tag).join(', ')}`)
    }
    if (VERBOSE && plan.unknown.length > 0) {
      console.log(`   [info] Filas aplicadas sin coincidencia exacta en el journal (${plan.unknown.length})`)
    }
    if (plan.upToDate && applied.length === journal.length) {
      console.log('   [OK] Migraciones al dia.')
    }

    // --- Esquema ---
    hr()
    console.log('\nEsquema (Drizzle vs BD)')
    const tablesReg = await pool.query(`SELECT to_regclass('public.tenant') AS reg`)
    if (!tablesReg.rows[0]?.reg) {
      hasErrors = true
      console.log('   [ERROR] No existe la tabla tenant (BD vacia). Corre npm run db:migrate.')
    } else {
      const dbColumns: DbColumnsByTable = new Map()
      const colRows = await pool.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`
      )
      for (const r of colRows.rows) {
        if (!dbColumns.has(r.table_name)) dbColumns.set(r.table_name, new Set())
        dbColumns.get(r.table_name)!.add(r.column_name)
      }

      const expected = collectExpectedTables()
      const diff = diffSchema(expected, dbColumns)
      console.log(`   Tablas esperadas: ${expected.length} | Tablas en BD: ${dbColumns.size}`)

      if (diff.missingTables.length > 0) {
        hasErrors = true
        console.log(`   [ERROR] Tablas faltantes (${diff.missingTables.length}):`)
        for (const t of diff.missingTables) console.log(`      - ${t}`)
      }
      if (diff.missingColumns.length > 0) {
        hasErrors = true
        console.log(`   [ERROR] Columnas faltantes (${diff.missingColumns.reduce((n, x) => n + x.columns.length, 0)}):`)
        for (const m of diff.missingColumns) console.log(`      - ${m.table}: ${m.columns.join(', ')}`)
      }
      if (diff.extraColumns.length > 0 && VERBOSE) {
        const total = diff.extraColumns.reduce((n, x) => n + x.columns.length, 0)
        console.log(`   [info] Columnas en BD no mapeadas por Drizzle: ${total}`)
        for (const e of diff.extraColumns) console.log(`      - ${e.table}: ${e.columns.join(', ')}`)
      }
      if (diff.ok && diff.extraColumns.length === 0) {
        console.log('   [OK] Esquema sincronizado.')
      } else if (diff.ok) {
        console.log('   [OK] Sin faltantes (solo columnas extra, sin impacto).')
      }
    }

    // --- Datos ---
    hr()
    console.log('\nDatos')
    const tenantsExists = await pool.query(`SELECT to_regclass('public.tenant') AS reg`)
    if (tenantsExists.rows[0]?.reg) {
      const tenants = await pool.query<{ id: string; name: string; dbSlug: string; onboardingCompleted: boolean; dianEnvironment: string }>(
        `SELECT id, name, "dbSlug", "onboardingCompleted", "dianEnvironment" FROM tenant ORDER BY id`
      )
      console.log(`   Tenants: ${tenants.rows.length}`)
      for (const t of tenants.rows.slice(0, 10)) {
        console.log(`     - ${t.id} | ${t.name} | slug=${t.dbSlug} | onboarding=${t.onboardingCompleted} | DIAN=${t.dianEnvironment}`)
      }
      if (tenants.rows.length === 0) {
        console.log('   [WARN] No hay tenants. La app no mostrara datos hasta crear uno (seed).')
      }
    }
    const productsExists = await pool.query(`SELECT to_regclass('public.product') AS reg`)
    if (productsExists.rows[0]?.reg) {
      const products = await pool.query<{ tenantId: string; total: string; activos: string }>(
        `SELECT "tenantId", count(*)::text AS total, count(*) FILTER (WHERE status='ACTIVE')::text AS activos FROM product GROUP BY "tenantId" ORDER BY "tenantId"`
      )
      let total = 0
      for (const p of products.rows) {
        total += Number(p.total)
        console.log(`   Productos tenant ${p.tenantId}: ${p.total} (activos ${p.activos})`)
      }
      if (products.rows.length === 0) console.log('   [WARN] No hay productos. Por eso no se ven en el POS.')
      else console.log(`   Total productos: ${total}`)
    }

    hr()
    if (hasErrors) {
      console.log('\n[ERROR] DB DOCTOR: se detectaron problemas. Corre npm run db:migrate (y revisa el entorno).')
    } else {
      console.log('\n[OK] DB DOCTOR: todo OK.')
    }
    hr()

    await pool.end()

    if (hasErrors && !SOFT) process.exit(1)
    process.exit(0)
  } catch (err) {
    await pool.end().catch(() => {})
    console.error('\n[ERROR] DB DOCTOR: error de conexion o ejecucion:', (err as Error).message)
    hr()
    if (!SOFT) process.exit(1)
    process.exit(0)
  }
}

main()
