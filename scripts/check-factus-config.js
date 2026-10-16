/**
 * check-factus-config.js
 * Verifica la configuración de Factus/DIAN en la base de datos.
 * Advierte si faltan credenciales o el rango de numeración.
 *
 * Uso:
 *   node scripts/check-factus-config.js
 */

const { Client } = require('pg')
require('dotenv').config()

const dbUrl = process.env.DATABASE_URL

if (!dbUrl) {
  console.error('       ERROR - DATABASE_URL no está definida en el archivo .env')
  process.exit(1)
}

const client = new Client({
  connectionString: dbUrl,
  connectionTimeoutMillis: 5000,
  statement_timeout: 5000,
  query_timeout: 5000,
})

// Timeout global: si pasa de 10s, abortar y continuar
const timeout = setTimeout(() => {
  console.error('       AVISO - Timeout verificando Factus (>10s). Continuando de todos modos.')
  try { client.end() } catch (_) {}
  process.exit(0)
}, 10000)
timeout.unref()

;(async () => {
  try {
    await client.connect()
    clearTimeout(timeout)

    // Traer todos los tenants y validar su configuración de Factus
    const { rows: tenants } = await client.query(`
      SELECT
        id,
        name,
        nit,
        "factusClientId",
        "factusClientSecret",
        "factusUsername",
        "factusPassword",
        "factusEnvironment",
        "factusNumberingRangeId"
      FROM "tenant"
      WHERE status = 'ACTIVE'
    `)

    if (tenants.length === 0) {
      console.log('       AVISO - No hay tenants activos en la base de datos.')
      process.exit(0)
    }

    let warnings = 0
    for (const t of tenants) {
      const hasCreds = !!(t.factusClientId && t.factusClientSecret && t.factusUsername && t.factusPassword)
      const hasRange = t.factusNumberingRangeId && Number(t.factusNumberingRangeId) > 0
      const env = t.factusEnvironment || 'sandbox'

      if (!hasCreds) {
        console.log(`       [${t.name}] SIN credenciales de Factus configuradas.`)
        warnings++
      } else if (!hasRange) {
        console.log(`       [${t.name}] Credenciales OK, pero SIN rango de numeración configurado.`)
        console.log(`                  -> Configura en /dashboard/settings (ID rango de numeración).`)
        warnings++
      } else {
        console.log(`       [${t.name}] OK - Factus ${env.toUpperCase()} configurado (rango ID: ${t.factusNumberingRangeId})`)
      }
    }

    if (warnings > 0) {
      console.log('')
      console.log('       NOTA: Las facturas se crearán localmente, pero la transmisión a DIAN fallará')
      console.log('             hasta que completes la configuración en /dashboard/settings.')
    }

    process.exit(0)
  } catch (err) {
    console.error(`       ERROR - Fallo al verificar Factus: ${err.message}`)
    process.exit(1)
  } finally {
    try { await client.end() } catch (_) {}
  }
})()