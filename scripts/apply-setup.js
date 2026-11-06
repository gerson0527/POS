const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { Client, Pool } = require('pg')
const dotenv = require('dotenv')

function updateEnv(newDbUrl, dbMeta) {
  const envPath = path.join(process.cwd(), '.env')
  let existingEnv = ''
  if (fs.existsSync(envPath)) {
    existingEnv = fs.readFileSync(envPath, 'utf8')
  }

  const parsed = dotenv.parse(existingEnv)

  parsed.DATABASE_URL = newDbUrl
  if (dbMeta && dbMeta.user) parsed.POSTGRES_USER = dbMeta.user
  if (dbMeta && dbMeta.password) parsed.POSTGRES_PASSWORD = dbMeta.password
  if (dbMeta && dbMeta.db) parsed.POSTGRES_DB = dbMeta.db

  if (!parsed.BETTER_AUTH_SECRET) parsed.BETTER_AUTH_SECRET = crypto.randomBytes(32).toString('hex')
  if (!parsed.BETTER_AUTH_URL) parsed.BETTER_AUTH_URL = 'http://localhost:3000'
  if (!parsed.NEXT_PUBLIC_APP_URL) parsed.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  if (!parsed.ENCRYPTION_KEY) parsed.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64url')
  if (!parsed.CRON_SECRET) parsed.CRON_SECRET = crypto.randomBytes(24).toString('hex')
  if (!parsed.PORT) parsed.PORT = '3000'
  if (!parsed.NODE_ENV) parsed.NODE_ENV = 'production'

  const lines = [
    '# ============================================================',
    '# CONFIGURACIÓN GENERAL POS ENTERPRISE DIAN (Generado por Setup)',
    '# ============================================================',
  ]
  for (const [k, v] of Object.entries(parsed)) {
    lines.push(`${k}=${v}`)
  }
  fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8')
}

async function main() {
  let payloadStr = process.argv[2]
  if (!payloadStr) {
    console.log(JSON.stringify({ ok: false, error: 'Parámetros no proporcionados' }))
    process.exit(1)
  }

  let config
  try {
    config = JSON.parse(payloadStr)
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: 'JSON inválido: ' + e.message }))
    process.exit(1)
  }

  const {
    mode = 'local',
    dbName = 'pos_retail_enterprise',
    dbUser = 'postgres',
    dbPassword = '',
    dbPort = '5432',
    cloudUrl = '',
    companyName = 'Mi Comercio POS S.A.S.',
    companyNit = '901234567-8',
    adminEmail = 'admin@posretail.co',
    adminName = 'Administrador General',
    adminPassword = '',
  } = config

  let finalDatabaseUrl = ''
  let dbMeta = {}

  if (mode === 'local') {
    const rootUrl = `postgresql://${dbUser}:${encodeURIComponent(dbPassword)}@localhost:${dbPort}/postgres`
    const rootClient = new Client({ connectionString: rootUrl, connectionTimeoutMillis: 8000 })

    try {
      await rootClient.connect()
    } catch (err) {
      console.log(JSON.stringify({ ok: false, error: `No fue posible conectar al motor PostgreSQL: ${err.message}` }))
      process.exit(1)
    }

    try {
      const checkDb = await rootClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])
      if (checkDb.rows.length === 0) {
        await rootClient.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`)
      }
    } catch (err) {
      console.log(JSON.stringify({ ok: false, error: `Error al crear la base de datos "${dbName}": ${err.message}` }))
      process.exit(1)
    } finally {
      await rootClient.end()
    }

    finalDatabaseUrl = `postgresql://${dbUser}:${encodeURIComponent(dbPassword)}@localhost:${dbPort}/${dbName}`
    dbMeta = { user: dbUser, password: dbPassword, db: dbName }
  } else {
    finalDatabaseUrl = cloudUrl
  }

  // Guardar en .env
  updateEnv(finalDatabaseUrl, dbMeta)
  process.env.DATABASE_URL = finalDatabaseUrl

  console.log(JSON.stringify({ ok: true, databaseUrl: finalDatabaseUrl.replace(/:[^:@]+@/, ':****@') }))
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: err.message || String(err) }))
  process.exit(1)
})
