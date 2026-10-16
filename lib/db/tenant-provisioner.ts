// lib/db/tenant-provisioner.ts
// Crea físicamente la base de datos para un tenant nuevo.
// - Web dev (Postgres): `CREATE DATABASE pos_tenant_<slug>` en el mismo server
// - Tauri (SQLite): crea archivo <data_dir>/tenants/<slug>.db
//
// Después de crear la BD, aplica las migraciones de drizzle (fuente única: lib/db/schema).

import { Client } from 'pg'
import { Pool } from 'pg'
import { runMigrations } from './migrate'
import { closeAllTenantPools } from './tenant-connection'

/** Crea la BD de un tenant nuevo y le aplica las migraciones. */
export async function provisionTenantDatabase(slug: string): Promise<{ ok: boolean; message: string }> {
  // Resuelve la base URL de la BD a partir del master connection string
  const masterUrl = new URL(
    process.env.DATABASE_URL ||
      `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || ''}@localhost:5432/${process.env.POSTGRES_DB || 'pruebas_POS'}`
  )

  const dbName = `pos_tenant_${slug.replace(/[^a-z0-9_]/gi, '_')}`

  // Conexión a la BD `postgres` del cluster (necesario para CREATE DATABASE)
  // porque NO puedes hacer CREATE DATABASE desde una conexión ya adentro de la target
  const adminUrl = new URL(masterUrl)
  adminUrl.pathname = '/postgres'

  const admin = new Client({ connectionString: adminUrl.toString() })
  try {
    await admin.connect()

    // Verificar si la BD ya existe
    const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName])
    if (exists.rowCount && exists.rowCount > 0) {
      // Ya existe — no la recreamos
      await admin.end()
      return { ok: true, message: `La BD ${dbName} ya existe.` }
    }

    // Crear la BD
    await admin.query(`CREATE DATABASE "${dbName}"`)
    await admin.end()
  } catch (err: any) {
    try {
      await admin.end()
    } catch {}
    return { ok: false, message: `Error creando BD ${dbName}: ${err.message}` }
  }

  // Ahora crear un pool y aplicar las migraciones de drizzle
  const targetUrl = new URL(masterUrl)
  targetUrl.pathname = `/${dbName}`

  const pool = new Pool({ connectionString: targetUrl.toString() })

  try {
    // Fase 4.24: fuente única de esquema — se aplican las migraciones de drizzle-kit
    // (antes: buildBusinessMigrationSql(), una copia manual divergente de init.ts).
    await runMigrations(pool)
    await pool.end()
    return { ok: true, message: `BD ${dbName} creada y migrada correctamente.` }
  } catch (err: any) {
    try {
      await pool.end()
    } catch {}
    return { ok: false, message: `BD creada pero error en migración: ${err.message}` }
  }
}

/** Elimina la BD de un tenant. ¡CUIDADO! Borra todos los datos. */
export async function dropTenantDatabase(slug: string): Promise<{ ok: boolean; message: string }> {
  if (slug === 'default' || !slug) {
    return { ok: false, message: 'No se puede eliminar la BD master.' }
  }
  const masterUrl = new URL(
    process.env.DATABASE_URL ||
      `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || ''}@localhost:5432/${process.env.POSTGRES_DB || 'pruebas_POS'}`
  )
  const adminUrl = new URL(masterUrl)
  adminUrl.pathname = '/postgres'
  const dbName = `pos_tenant_${slug.replace(/[^a-z0-9_]/gi, '_')}`

  const admin = new Client({ connectionString: adminUrl.toString() })
  try {
    await admin.connect()
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`)
    await admin.end()
    closeAllTenantPools()
    return { ok: true, message: `BD ${dbName} eliminada.` }
  } catch (err: any) {
    try {
      await admin.end()
    } catch {}
    return { ok: false, message: `Error eliminando BD: ${err.message}` }
  }
}

/** Verifica si la BD de un tenant existe y está lista. */
export async function checkTenantDatabase(slug: string): Promise<{ exists: boolean; dbName: string }> {
  if (slug === 'default' || !slug) {
    return { exists: true, dbName: process.env.POSTGRES_DB || 'pruebas_POS' }
  }
  const masterUrl = new URL(
    process.env.DATABASE_URL ||
      `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || ''}@localhost:5432/${process.env.POSTGRES_DB || 'pruebas_POS'}`
  )
  const adminUrl = new URL(masterUrl)
  adminUrl.pathname = '/postgres'
  const dbName = `pos_tenant_${slug.replace(/[^a-z0-9_]/gi, '_')}`
  const admin = new Client({ connectionString: adminUrl.toString() })
  try {
    await admin.connect()
    const r = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName])
    await admin.end()
    return { exists: (r.rowCount || 0) > 0, dbName }
  } catch {
    try {
      await admin.end()
    } catch {}
    return { exists: false, dbName }
  }
}
