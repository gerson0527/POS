import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || ''}@localhost:5432/${process.env.POSTGRES_DB || 'pruebas_POS'}`

export const pool = new Pool({
  connectionString,
})

export const db = drizzle(pool, { schema })

// Fase 4.24: se eliminó el DDL automático de init.ts a nivel de import.
// Las tablas se gestionan con drizzle-kit → `npm run db:migrate`
// (ver lib/db/migrate.ts; también lo ejecutan scripts/seed.ts y tenant-provisioner.ts).
