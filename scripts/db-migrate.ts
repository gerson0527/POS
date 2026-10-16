import dotenv from 'dotenv'
dotenv.config()

import { Pool } from 'pg'
import { runMigrations } from '../lib/db/migrate'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL no está definida (.env / .env.local)')

  const pool = new Pool({ connectionString: url })
  try {
    await runMigrations(pool, { adoptExisting: true })
    console.log('✅ Migraciones al día.')
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('❌ Error aplicando migraciones:', err)
  process.exit(1)
})
