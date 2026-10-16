// scripts/migrate-factus-encryption.js
//
// Migra las credenciales de Factus almacenadas en TEXTO PLANO en la tabla `tenant`
// al formato cifrado `v1:<iv>:<tag>:<ct>` (AES-256-GCM) usado por lib/security/encrypt.ts.
//
// Uso:
//   node -e "require('dotenv').config()" no aplica; se carga dotenv aquí.
//   node scripts/migrate-factus-encryption.js           # dry-run (solo imprime)
//   node scripts/migrate-factus-encryption.js --apply   # aplica los cambios

require('dotenv').config()
const crypto = require('crypto')
const { Client } = require('pg')

const VERSION_PREFIX = 'v1'
const IV_BYTES = 12
const TAG_BYTES = 16
const FALLBACK_KEY_MATERIAL = 'pos-dian-credentials-encryption-key-2026'

function getKey() {
  const material = process.env.ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET || FALLBACK_KEY_MATERIAL
  return crypto.createHash('sha256').update(material, 'utf8').digest()
}

function isEncrypted(v) {
  if (!v || typeof v !== 'string') return false
  const p = v.split(':')
  return p.length === 4 && p[0] === VERSION_PREFIX
}

function encryptSecret(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return plaintext
  if (isEncrypted(plaintext)) return plaintext
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${VERSION_PREFIX}:${iv.toString('base64url')}:${tag.toString('base64url')}:${ct.toString('base64url')}`
}

const APPLY = process.argv.includes('--apply')
const COLS = ['factusClientId', 'factusClientSecret', 'factusUsername', 'factusPassword']

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL no definida.')
    process.exit(1)
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  const { rows } = await client.query(
    `SELECT id, ${COLS.map((c) => `"${c}"`).join(', ')} FROM public.tenant`
  )
  console.log(`Tenants encontrados: ${rows.length} (${APPLY ? 'APPLY' : 'DRY-RUN'})`)

  let changed = 0
  for (const t of rows) {
    const updates = {}
    for (const col of COLS) {
      const val = t[col]
      if (val && !isEncrypted(val)) {
        updates[col] = encryptSecret(val)
      }
    }
    const nCols = Object.keys(updates).length
    if (nCols === 0) {
      console.log(`  - ${t.id}: nada que migrar (ya cifrado o vacío).`)
      continue
    }
    changed++
    console.log(`  - ${t.id}: migrando ${nCols} columna(s): ${Object.keys(updates).join(', ')}`)
    for (const col of Object.keys(updates)) {
      console.log(`      ${col}: "${String(t[col]).slice(0, 12)}..." -> ciphertext (${updates[col].length} chars)`)
    }
    if (APPLY) {
      const setClause = Object.keys(updates).map((c, i) => `"${c}" = $${i + 1}`).join(', ')
      const params = Object.values(updates)
      await client.query(`UPDATE public.tenant SET ${setClause}, "updatedAt" = now() WHERE id = $${params.length + 1}`, [
        ...params,
        t.id,
      ])
    }
  }

  await client.end()
  console.log(changed === 0
    ? 'No había credenciales en texto plano. Nada que hacer.'
    : APPLY
      ? `Migración completada: ${changed} tenant(s) actualizados.`
      : `Dry-run: ${changed} tenant(s) serían migrados. Ejecuta con --apply para aplicar.`)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
