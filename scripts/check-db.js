const { Client } = require('pg')
require('dotenv').config()

const dbName = process.env.POSTGRES_DB || 'pruebas_POS'
const dbUrl = process.env.DATABASE_URL

if (!dbUrl) {
  console.error('       ERROR - DATABASE_URL no está definida en el archivo .env')
  process.exit(1)
}

const client = new Client({ connectionString: dbUrl })

client
  .connect()
  .then(() => {
    console.log(`       OK - Base de Datos PostgreSQL (${dbName}) CONECTADA CORRECTAMENTE`)
    client.end()
    process.exit(0)
  })
  .catch((err) => {
    console.error(`       ERROR - Fallo al conectar a la base de datos (${dbName}): ${err.message}`)
    process.exit(1)
  })
