import { NextRequest, NextResponse } from 'next/server'
import { Client, Pool } from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execSync } from 'node:child_process'
import dotenv from 'dotenv'

export const dynamic = 'force-dynamic'

function checkPortOpen(port = 5432): boolean {
  try {
    const res = execSync(`netstat -an | findstr :${port} | findstr LISTENING`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    return res.length > 0
  } catch {
    return false
  }
}

function checkPostgresInstalled(): boolean {
  try {
    execSync('psql --version', { stdio: 'ignore' })
    return true
  } catch {}

  try {
    const res = execSync(
      'powershell -NoProfile -Command "Get-Service *postgres* -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Status"',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    )
    if (res.trim().length > 0) return true
  } catch {}

  return checkPortOpen(5432)
}

function getEnvPath() {
  return process.env.POS_DESKTOP_ENV_FILE || path.join(process.cwd(), '.env')
}

function quoteEnvValue(value: string): string {
  // dotenv no desescapa comillas: elegir un delimitador que preserve el valor.
  for (const quote of ["'", '"', '`']) {
    const quoted = `${quote}${value}${quote}`
    if (dotenv.parse(`VALUE=${quoted}`).VALUE === value) return quoted
  }
  throw new Error('No fue posible serializar un valor de configuración sin alterar su contenido.')
}

function updateEnvFile(newDbUrl: string, dbMeta?: { user?: string; password?: string; db?: string }) {
  const envPath = getEnvPath()
  let existingEnv = ''
  if (fs.existsSync(envPath)) {
    existingEnv = fs.readFileSync(envPath, 'utf8')
  }

  const parsed = dotenv.parse(existingEnv)

  parsed.DATABASE_URL = newDbUrl
  if (dbMeta?.user) parsed.POSTGRES_USER = dbMeta.user
  if (dbMeta?.password) parsed.POSTGRES_PASSWORD = dbMeta.password
  if (dbMeta?.db) parsed.POSTGRES_DB = dbMeta.db

  if (!parsed.BETTER_AUTH_SECRET) {
    parsed.BETTER_AUTH_SECRET = crypto.randomBytes(32).toString('hex')
  }
  if (!parsed.BETTER_AUTH_URL) {
    parsed.BETTER_AUTH_URL = 'http://localhost:3000'
  }
  if (!parsed.NEXT_PUBLIC_APP_URL) {
    parsed.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  }
  if (!parsed.ENCRYPTION_KEY) {
    parsed.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64url')
  }
  if (!parsed.CRON_SECRET) {
    parsed.CRON_SECRET = crypto.randomBytes(24).toString('hex')
  }
  if (!parsed.PORT) {
    parsed.PORT = '3000'
  }
  if (!parsed.NODE_ENV) {
    parsed.NODE_ENV = 'production'
  }

  const lines: string[] = [
    '# ============================================================',
    '# CONFIGURACIÓN GENERAL POS ENTERPRISE DIAN (Generado por Setup)',
    '# ============================================================',
  ]

  for (const [k, v] of Object.entries(parsed)) {
    lines.push(`${k}=${quoteEnvValue(v)}`)
  }

  fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8')
}

export async function GET() {
  const pgInstalled = Boolean(process.env.POS_DESKTOP_ENV_FILE) || checkPostgresInstalled()

  let dbConnected = false
  let setupRequired = true
  const currentUrl = process.env.DATABASE_URL
  if (currentUrl) {
    const client = new Client({ connectionString: currentUrl, connectionTimeoutMillis: 3000 })
    try {
      await client.connect()
      await client.query('SELECT 1')
      const schemaStatus = await client.query(
        "SELECT to_regclass('public.user') IS NOT NULL AS has_user_table",
      )
      if (schemaStatus.rows[0]?.has_user_table) {
        const userStatus = await client.query(
          'SELECT EXISTS (SELECT 1 FROM "user" LIMIT 1) AS has_admin',
        )
        setupRequired = !userStatus.rows[0]?.has_admin
      }
      await client.end()
      dbConnected = true
    } catch {
      try { await client.end() } catch (_) {}
    }
  }

  return NextResponse.json({
    ok: true,
    pgInstalled,
    dbConnected,
    setupRequired,
    hasEnv: fs.existsSync(getEnvPath()),
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { ok: false, error: 'Solicitud de configuración inválida.' },
        { status: 400 }
      )
    }
    const {
      mode,
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
    } = body

    let finalDatabaseUrl = ''
    let dbMeta: { user?: string; password?: string; db?: string } = {}
    const isDesktop = Boolean(process.env.POS_DESKTOP_ENV_FILE)

    if (isDesktop) {
      if (!process.env.DATABASE_URL) {
        return NextResponse.json(
          { ok: false, error: 'La base privada del POS no está configurada. Reinicia la aplicación.' },
          { status: 503 }
        )
      }
      if (typeof companyName !== 'string' || typeof companyNit !== 'string' ||
          typeof adminName !== 'string' || typeof adminEmail !== 'string' ||
          typeof adminPassword !== 'string' || !companyName.trim() || !companyNit.trim() ||
          !adminName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim()) ||
          adminPassword.trim().length < 12) {
        return NextResponse.json(
          { ok: false, error: 'Completa los datos de empresa y administrador. La contraseña debe tener al menos 12 caracteres.' },
          { status: 400 }
        )
      }
      finalDatabaseUrl = process.env.DATABASE_URL
    } else if (mode === 'local') {
      const rootUrl = `postgresql://${dbUser}:${encodeURIComponent(dbPassword)}@localhost:${dbPort}/postgres`
      const rootClient = new Client({ connectionString: rootUrl, connectionTimeoutMillis: 8000 })

      try {
        await rootClient.connect()
      } catch (err: any) {
        return NextResponse.json(
          { ok: false, error: `No fue posible conectar al motor PostgreSQL local: ${err.message}` },
          { status: 400 }
        )
      }

      try {
        const checkDb = await rootClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])
        if (checkDb.rows.length === 0) {
          await rootClient.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`)
        }
      } finally {
        await rootClient.end()
      }

      finalDatabaseUrl = `postgresql://${dbUser}:${encodeURIComponent(dbPassword)}@localhost:${dbPort}/${dbName}`
      dbMeta = { user: dbUser, password: dbPassword, db: dbName }
    } else {
      if (!cloudUrl || !cloudUrl.startsWith('postgres')) {
        return NextResponse.json(
          { ok: false, error: 'Cadena de conexión de base de datos inválida.' },
          { status: 400 }
        )
      }

      const cloudClient = new Client({ connectionString: cloudUrl, connectionTimeoutMillis: 12000 })
      try {
        await cloudClient.connect()
        await cloudClient.query('SELECT 1')
        await cloudClient.end()
      } catch (err: any) {
        try { await cloudClient.end() } catch (_) {}
        return NextResponse.json(
          { ok: false, error: `No fue posible conectar al proveedor en la nube: ${err.message}` },
          { status: 400 }
        )
      }

      finalDatabaseUrl = cloudUrl
    }

    // Actualizar .env
    updateEnvFile(finalDatabaseUrl, dbMeta)
    process.env.DATABASE_URL = finalDatabaseUrl

    // Ejecutar migraciones Drizzle
    const pool = new Pool({ connectionString: finalDatabaseUrl })
    try {
      const { runMigrations } = await import('@/lib/db/migrate')
      await runMigrations(pool, { adoptExisting: true })
      if (isDesktop) {
        const initialized = await pool.query(
          'SELECT EXISTS (SELECT 1 FROM "user" LIMIT 1) AS has_admin',
        )
        if (initialized.rows[0]?.has_admin) {
          return NextResponse.json(
            { ok: false, error: 'La configuración inicial ya fue completada.' },
            { status: 409 }
          )
        }
      }
    } catch (migErr: any) {
      return NextResponse.json(
        { ok: false, error: `Error al aplicar tablas/migraciones: ${migErr.message}` },
        { status: 500 }
      )
    } finally {
      await pool.end()
    }

    // Ejecutar seed con los datos del administrador y empresa
    try {
      const { runSeed } = await import('@/scripts/seed')
      await runSeed({
        adminEmail: adminEmail.trim(),
        adminName: adminName.trim(),
        adminPassword: adminPassword || 'Admin12345pos!',
        companyName: companyName.trim(),
        companyNit: companyNit.trim(),
        companyEmail: adminEmail.trim(),
      })
    } catch (seedErr: any) {
      if (isDesktop) {
        return NextResponse.json(
          { ok: false, error: `No se pudo crear la cuenta inicial: ${seedErr.message}` },
          { status: 500 }
        )
      }
      console.warn('Advertencia en seed:', seedErr)
    }

    return NextResponse.json({
      ok: true,
      message: 'Base de datos configurada, tablas instaladas y cuenta inicial lista.',
    })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Error inesperado durante la configuración' },
      { status: 500 }
    )
  }
}
