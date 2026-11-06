/**
 * POS ENTERPRISE // ASISTENTE INTERACTIVO DE CONFIGURACIÓN DE BASE DE DATOS
 *
 * Guía paso a paso al cliente o instalador para:
 * 1. Seleccionar entre Base de Datos Local (PostgreSQL en esta máquina) o Proveedor en la Nube (Neon, Supabase, Railway, RDS).
 * 2. Verificar o instalar PostgreSQL localmente vía winget si falta (con explicación clara).
 * 3. Crear la base de datos con el nombre elegido por el cliente.
 * 4. Probar la conectividad y guardar las credenciales en .env.
 * 5. Aplicar todas las migraciones (creación de tablas del sistema).
 * 6. Inicializar datos semilla (empresa/tenant personalizado, usuario administrador con clave segura, catálogos e inventario).
 */

import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execSync, spawnSync } from 'node:child_process'
import { Client, Pool } from 'pg'
import dotenv from 'dotenv'
import type { SeedConfig } from './seed'

// ANSI colors for clean, professional tactical styling
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bgBlue: '\x1b[44m\x1b[37m\x1b[1m',
}

function banner() {
  console.clear()
  console.log(`${C.cyan}================================================================${C.reset}`)
  console.log(`${C.bold}    POS ENTERPRISE DIAN // ASISTENTE DE BASE DE DATOS & SETUP   ${C.reset}`)
  console.log(`${C.dim}    Instalador y configurador de entorno para punto de venta   ${C.reset}`)
  console.log(`${C.cyan}================================================================${C.reset}\n`)
}

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
  // 1. Chequear si el comando psql responde
  try {
    execSync('psql --version', { stdio: 'ignore' })
    return true
  } catch {}

  // 2. Chequear servicio de Windows postgresql*
  try {
    const res = execSync('powershell -NoProfile -Command "Get-Service *postgres* -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Status"', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    if (res.trim().length > 0) return true
  } catch {}

  // 3. Chequear si el puerto 5432 ya está escuchando
  return checkPortOpen(5432)
}

function startPostgresService() {
  try {
    console.log(`${C.dim}Intentando iniciar el servicio de PostgreSQL en Windows...${C.reset}`)
    execSync('powershell -NoProfile -Command "Get-Service *postgres* -ErrorAction SilentlyContinue | Start-Service -ErrorAction SilentlyContinue"', {
      stdio: 'ignore',
    })
  } catch {}
}

function parseOrGenerateEnv(newDbUrl: string, dbMeta?: { user?: string; password?: string; db?: string }) {
  const envPath = path.join(process.cwd(), '.env')
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
    lines.push(`${k}=${v}`)
  }

  fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8')
  console.log(`${C.green}✔ Archivo .env configurado correctamente.${C.reset}`)
}

async function testConnection(connectionString: string, timeoutMs = 8000): Promise<{ ok: boolean; error?: string }> {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: timeoutMs,
  })
  try {
    await client.connect()
    await client.query('SELECT 1 AS ok')
    await client.end()
    return { ok: true }
  } catch (err: any) {
    try { await client.end() } catch (_) {}
    return { ok: false, error: err.message || String(err) }
  }
}

async function main() {
  const rl = readline.createInterface({ input, output })

  try {
    banner()

    console.log(`${C.bold}¿Cómo deseas configurar la base de datos para este sistema?${C.reset}\n`)
    console.log(`  ${C.cyan}[1]${C.reset} ${C.bold}Base de datos LOCAL${C.reset} en este equipo (Recomendado para trabajo local sin internet constante)`)
    console.log(`  ${C.cyan}[2]${C.reset} ${C.bold}Base de datos en la NUBE / PROVEEDOR COMPRADO${C.reset} (Neon, Supabase, Railway, RDS, Servidor Externo)\n`)

    let modeChoice = ''
    while (modeChoice !== '1' && modeChoice !== '2') {
      modeChoice = (await rl.question(`${C.yellow}Selecciona una opción [1 o 2] (Por defecto 1): ${C.reset}`)).trim() || '1'
    }

    let finalDatabaseUrl = ''
    let dbMeta: { user?: string; password?: string; db?: string } = {}

    if (modeChoice === '1') {
      // -------------------------------------------------------------
      // MODO LOCAL
      // -------------------------------------------------------------
      console.log(`\n${C.cyan}--- [MODO 1: BASE DE DATOS LOCAL POSTGRESQL] ---${C.reset}\n`)

      console.log(`${C.dim}Verificando si PostgreSQL está instalado en Windows...${C.reset}`)
      const isPgInstalled = checkPostgresInstalled()

      if (!isPgInstalled) {
        console.log(`\n${C.yellow}⚠ AVISO IMPORTANTE:${C.reset}`)
        console.log(`Para ejecutar el sistema con base de datos local en esta máquina,`)
        console.log(`es ${C.bold}estrictamente necesario${C.reset} tener instalado el motor PostgreSQL.`)
        console.log(`Este motor almacena tus ventas, turnos de caja, inventario y facturación de forma local y segura.\n`)

        const installAnswer = (await rl.question(`${C.bold}¿Deseas que descarguemos e instalemos PostgreSQL 16 automáticamente usando winget de Windows? (S/n): ${C.reset}`)).trim().toLowerCase()

        if (installAnswer !== 'n') {
          console.log(`\n${C.cyan}Ejecutando instalación desatendida de PostgreSQL 16 vía winget...${C.reset}`)
          console.log(`${C.dim}Por favor concede permisos de Administrador si Windows te lo solicita.${C.reset}\n`)
          try {
            spawnSync('winget', ['install', 'PostgreSQL.PostgreSQL.16', '--accept-source-agreements', '--accept-package-agreements'], {
              stdio: 'inherit',
            })
            console.log(`\n${C.green}✔ Proceso de instalación finalizado.${C.reset}`)
            startPostgresService()
          } catch (err: any) {
            console.log(`${C.red}No se pudo completar la instalación automática: ${err.message}${C.reset}`)
            console.log(`Puedes descargarlo manualmente desde: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads\n`)
          }
        } else {
          console.log(`\n${C.yellow}Has elegido no instalar automáticamente. Asegúrate de tener PostgreSQL activo en el puerto 5432 antes de continuar.${C.reset}\n`)
        }
      } else {
        console.log(`${C.green}✔ PostgreSQL detectado en el equipo.${C.reset}\n`)
      }

      // Preguntar credenciales locales
      console.log(`${C.bold}Configuración de la Base de Datos Local:${C.reset}`)

      const dbNameInput = (await rl.question(`${C.dim}¿Cómo deseas nombrar la base de datos? [pos_retail_enterprise]: ${C.reset}`)).trim()
      const dbName = dbNameInput || 'pos_retail_enterprise'

      const userInput = (await rl.question(`${C.dim}Usuario de PostgreSQL [postgres]: ${C.reset}`)).trim()
      const dbUser = userInput || 'postgres'

      const dbPassword = (await rl.question(`${C.dim}Contraseña del usuario ${dbUser}: ${C.reset}`)).trim()

      const portInput = (await rl.question(`${C.dim}Puerto de conexión [5432]: ${C.reset}`)).trim()
      const dbPort = portInput || '5432'

      dbMeta = { user: dbUser, password: dbPassword, db: dbName }

      console.log(`\n${C.cyan}Verificando conexión con el motor PostgreSQL...${C.reset}`)
      const rootUrl = `postgresql://${dbUser}:${encodeURIComponent(dbPassword)}@localhost:${dbPort}/postgres`

      const rootConn = await testConnection(rootUrl)
      if (!rootConn.ok) {
        console.log(`\n${C.red}✖ No fue posible conectar al motor PostgreSQL con esas credenciales:${C.reset}`)
        console.log(`  ${rootConn.error}`)
        console.log(`\nPor favor verifica que la contraseña de ${dbUser} sea correcta y que el servicio de PostgreSQL esté iniciado en el puerto ${dbPort}.`)
        process.exit(1)
      }
      console.log(`${C.green}✔ Conexión al motor PostgreSQL exitosa.${C.reset}`)

      // Verificar y crear la base de datos elegida si no existe
      console.log(`${C.dim}Comprobando si la base de datos "${dbName}" existe...${C.reset}`)
      const rootClient = new Client({ connectionString: rootUrl })
      await rootClient.connect()
      try {
        const checkDbRes = await rootClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])
        if (checkDbRes.rows.length === 0) {
          console.log(`${C.cyan}Creando base de datos "${dbName}"...${C.reset}`)
          await rootClient.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`)
          console.log(`${C.green}✔ Base de datos "${dbName}" creada con éxito.${C.reset}`)
        } else {
          console.log(`${C.green}✔ La base de datos "${dbName}" ya existe en el servidor.${C.reset}`)
        }
      } finally {
        await rootClient.end()
      }

      finalDatabaseUrl = `postgresql://${dbUser}:${encodeURIComponent(dbPassword)}@localhost:${dbPort}/${dbName}`

    } else {
      // -------------------------------------------------------------
      // MODO PROVEEDOR EN LA NUBE / COMPRADO
      // -------------------------------------------------------------
      console.log(`\n${C.cyan}--- [MODO 2: PROVEEDOR COMPRADO / NUBE] ---${C.reset}\n`)
      console.log(`Ingresa la cadena de conexión completa proporcionada por tu proveedor (Neon, Supabase, Railway, AWS, etc.):`)
      console.log(`${C.dim}Ejemplo: postgresql://usuario:contraseña@ep-xyz.us-east-2.aws.neon.tech/nombre_bd?sslmode=require${C.reset}\n`)

      let inputUrl = ''
      while (!inputUrl) {
        inputUrl = (await rl.question(`${C.yellow}DATABASE_URL: ${C.reset}`)).trim()
      }

      console.log(`\n${C.cyan}Probando conexión con el proveedor en la nube...${C.reset}`)
      const cloudConn = await testConnection(inputUrl, 12000)
      if (!cloudConn.ok) {
        console.log(`\n${C.red}✖ Falló la conexión con el proveedor:${C.reset}`)
        console.log(`  ${cloudConn.error}`)
        console.log(`\nVerifica que la URL, usuario, contraseña y permisos de red / IP allowlist sean correctos.`)
        process.exit(1)
      }
      console.log(`${C.green}✔ Conexión al proveedor en la nube exitosa.${C.reset}\n`)

      finalDatabaseUrl = inputUrl
    }

    // Guardar variables en .env
    console.log(`\n${C.cyan}Guardando configuración en archivo .env...${C.reset}`)
    parseOrGenerateEnv(finalDatabaseUrl, dbMeta)

    // Cargar nuevo entorno en proceso actual
    process.env.DATABASE_URL = finalDatabaseUrl

    // Ejecutar Migraciones (Crear Tablas)
    console.log(`\n${C.cyan}================================================================${C.reset}`)
    console.log(`${C.bold}    INSTALANDO TABLAS Y ESTRUCTURA DEL SISTEMA (MIGRACIONES)    ${C.reset}`)
    console.log(`${C.cyan}================================================================${C.reset}\n`)

    const pool = new Pool({ connectionString: finalDatabaseUrl })
    try {
      const { runMigrations } = await import('../lib/db/migrate')
      console.log(`${C.dim}Aplicando esquemas DIAN, clientes, inventarios, turnos y ventas...${C.reset}`)
      await runMigrations(pool, { adoptExisting: true })
      console.log(`${C.green}✔ Todas las tablas fueron creadas exitosamente.${C.reset}\n`)
    } catch (migErr: any) {
      console.log(`${C.red}Error al aplicar migraciones: ${migErr.message}${C.reset}`)
      process.exit(1)
    } finally {
      await pool.end()
    }

    // Preguntar si desea cargar datos iniciales de prueba / catálogo inicial
    console.log(`${C.cyan}================================================================${C.reset}`)
    console.log(`${C.bold}    CONFIGURACIÓN DE EMPRESA Y USUARIO ADMINISTRADOR            ${C.reset}`)
    console.log(`${C.cyan}================================================================${C.reset}\n`)

    const seedAnswer = (await rl.question(`${C.yellow}¿Deseas inicializar los datos base (tu empresa, usuario administrador y catálogos)? (S/n): ${C.reset}`)).trim().toLowerCase()

    let configuredAdminEmail = 'admin@posretail.co'
    let configuredAdminPass = 'Admin12345pos!'

    if (seedAnswer !== 'n') {
      console.log(`\n${C.bold}Por favor ingresa los datos de tu comercio y cuenta principal:${C.reset}\n`)

      const companyNameInput = (await rl.question(`${C.dim}Nombre comercial o Razón Social [Mi Comercio POS S.A.S.]: ${C.reset}`)).trim()
      const companyName = companyNameInput || 'Mi Comercio POS S.A.S.'

      const companyNitInput = (await rl.question(`${C.dim}NIT o Documento de la Empresa [901234567-8]: ${C.reset}`)).trim()
      const companyNit = companyNitInput || '901234567-8'

      const adminNameInput = (await rl.question(`${C.dim}Nombre completo del Administrador [Administrador General]: ${C.reset}`)).trim()
      const adminName = adminNameInput || 'Administrador General'

      let adminEmail = ''
      while (!adminEmail || !adminEmail.includes('@')) {
        adminEmail = (await rl.question(`${C.dim}Correo electrónico del Administrador (para iniciar sesión): ${C.reset}`)).trim()
        if (!adminEmail.includes('@')) {
          console.log(`${C.yellow}Por favor ingresa un correo electrónico válido.${C.reset}`)
        }
      }
      configuredAdminEmail = adminEmail

      let adminPassword = ''
      while (adminPassword.length < 12) {
        adminPassword = (await rl.question(`${C.dim}Contraseña del Administrador (mínimo 12 caracteres): ${C.reset}`)).trim()
        if (adminPassword.length < 12) {
          console.log(`${C.yellow}Por seguridad, la contraseña debe tener al menos 12 caracteres.${C.reset}`)
        }
      }
      configuredAdminPass = adminPassword

      const seedConfig: SeedConfig = {
        adminEmail,
        adminName,
        adminPassword,
        companyName,
        companyNit,
        companyEmail: adminEmail,
      }

      console.log(`\n${C.cyan}Inicializando datos del sistema...${C.reset}`)
      try {
        const { runSeed } = await import('./seed')
        await runSeed(seedConfig)
        console.log(`${C.green}✔ Datos iniciales cargados correctamente.${C.reset}\n`)
      } catch (seedErr: any) {
        console.log(`${C.yellow}Nota en seed: ${seedErr.message}${C.reset}`)
      }
    }

    console.log(`${C.green}================================================================${C.reset}`)
    console.log(`${C.bold}${C.green}  ¡INSTALACIÓN Y CONFIGURACIÓN COMPLETADA CON ÉXITO!  ${C.reset}`)
    console.log(`${C.green}================================================================${C.reset}\n`)
    console.log(`  ${C.bold}Base de Datos:${C.reset}        ${finalDatabaseUrl.replace(/:[^:@]+@/, ':****@')}`)
    console.log(`  ${C.bold}Usuario Administrador:${C.reset} ${configuredAdminEmail}`)
    console.log(`  ${C.bold}Contraseña:${C.reset}            ${configuredAdminPass === 'Admin12345pos!' ? 'Admin12345pos! (por defecto)' : '******** (la ingresada)'}\n`)
    console.log(`Para iniciar la aplicación de escritorio ejecuta: ${C.bold}start-tauri.bat${C.reset}\n`)

  } finally {
    rl.close()
  }
}

main().catch((err) => {
  console.error(`\n${C.red}Error fatal durante el asistente:${C.reset}`, err)
  process.exit(1)
})
