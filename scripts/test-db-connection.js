const { Client } = require('pg')

async function main() {
  const connectionString = process.argv[2]
  if (!connectionString) {
    console.log(JSON.stringify({ ok: false, error: 'Cadena de conexión no proporcionada' }))
    process.exit(1)
  }

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
  })

  try {
    await client.connect()
    await client.query('SELECT 1')
    await client.end()
    console.log(JSON.stringify({ ok: true }))
    process.exit(0)
  } catch (err) {
    try { await client.end() } catch (_) {}
    console.log(JSON.stringify({ ok: false, error: err.message || String(err) }))
    process.exit(1)
  }
}

main()
