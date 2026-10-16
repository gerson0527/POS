import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle')

/**
 * Aplica las migraciones de drizzle a la BD conectada por `pool`.
 *
 * `adoptExisting`: las BDs creadas por el antiguo lib/db/init.ts no tienen registro en
 * drizzle.__drizzle_migrations; si ya tienen tablas, se registra la migración 0000 como
 * aplicada (sin ejecutarla) para que migrate() no vuelva a correr CREATE TABLEs contra
 * tablas existentes. En una BD limpia no hace nada y la migración se aplica normalmente.
 */
export async function runMigrations(pool: Pool, opts: { adoptExisting?: boolean } = {}) {
  if (opts.adoptExisting) await adoptPreDrizzleDatabase(pool)
  await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER })
}

async function adoptPreDrizzleDatabase(pool: Pool) {
  const legacy = await pool.query(`SELECT to_regclass('public.tenant') AS reg`)
  if (!legacy.rows[0]?.reg) return

  const tracked = await pool.query(`SELECT to_regclass('drizzle.__drizzle_migrations') AS reg`)
  if (tracked.rows[0]?.reg) return

  const journalPath = path.join(MIGRATIONS_FOLDER, 'meta', '_journal.json')
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'))
  const first = journal.entries[0]
  const migrationSql = fs.readFileSync(path.join(MIGRATIONS_FOLDER, `${first.tag}.sql`), 'utf8')
  const hash = crypto.createHash('sha256').update(migrationSql).digest('hex')

  await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle`)
  await pool.query(
    `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`
  )
  await pool.query(`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`, [
    hash,
    first.when,
  ])
  console.log('[db] BD preexistente adoptada: migración inicial registrada sin re-ejecutarla.')
}
