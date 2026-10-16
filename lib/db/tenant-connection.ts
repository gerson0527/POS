// lib/db/tenant-connection.ts
// Connection manager para multi-DB por tenant.
//
// Master DB (compartido): contiene `user`, `session`, `account`, `tenant`, `user_tenant`.
// Tenant DB (uno por empresa): contiene `product`, `customer`, `sale`, etc.
//
// En web dev (Postgres): cada tenant es un database separado en el mismo server Postgres
//   (ej: pos_tenant_mi_empresa).
// En Tauri (SQLite): cada tenant es un archivo separado (ej: <data_dir>/tenants/<slug>.db).
//
// Por ahora solo soportamos Postgres (que es lo que usa el dev server).
// La detección del modo se hace por env var: TAURI_DB_PATH.

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

// Master pool: la BD compartida con user/tenant/etc
const masterConnectionString =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || ''}@localhost:5432/${process.env.POSTGRES_DB || 'pruebas_POS'}`

const masterPool = new Pool({ connectionString: masterConnectionString })
const masterDbInstance = drizzle(masterPool, { schema })

export const masterDb = masterDbInstance
export const masterPoolInternal = masterPool

// Cache de pools por tenant
const tenantPools = new Map<string, Pool>()
const tenantDbs = new Map<string, ReturnType<typeof drizzle>>()

function deriveConnectionString(slug: string): string {
  // SQLite (Tauri): archivo separado
  if (process.env.TAURI_DB_PATH) {
    const dir = process.env.TAURI_DB_PATH.replace(/tenant\.db$/, '').replace(/\/$/, '')
    return `file:${dir}/tenants/${slug}.db`
  }
  // Postgres: misma base connection string, solo cambia el nombre de la BD
  const base = new URL(masterConnectionString)
  base.pathname = `/pos_tenant_${slug.replace(/[^a-z0-9_]/gi, '_')}`
  return base.toString()
}

/** Devuelve el pool de Postgres del tenant (con cache). */
export function getTenantPool(slug: string): Pool {
  if (slug === 'default' || !slug) return masterPool
  if (tenantPools.has(slug)) return tenantPools.get(slug)!
  const pool = new Pool({ connectionString: deriveConnectionString(slug) })
  tenantPools.set(slug, pool)
  return pool
}

/** Devuelve la instancia Drizzle del tenant (con cache). */
export function getTenantDb(slug: string) {
  if (slug === 'default' || !slug) return masterDbInstance
  if (tenantDbs.has(slug)) return tenantDbs.get(slug)!
  const db = drizzle(getTenantPool(slug), { schema })
  tenantDbs.set(slug, db)
  return db
}

/** Cierra todas las conexiones de tenants (útil al apagar el servidor). */
export async function closeAllTenantPools() {
  for (const [slug, pool] of tenantPools) {
    try {
      await pool.end()
    } catch (e) {
      console.error(`Error cerrando pool del tenant ${slug}:`, e)
    }
  }
  tenantPools.clear()
  tenantDbs.clear()
}
