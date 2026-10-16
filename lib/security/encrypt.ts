// lib/security/encrypt.ts
//
// Cifrado simétrico autenticado (AES-256-GCM) para secretos almacenados en BD
// (p. ej. credenciales de facturación electrónica del tenant).
//
// Diseño:
//   - Algoritmo: AES-256-GCM (cifrado autenticado; detecta manipulación del ciphertext).
//   - Clave: derivada con SHA-256 desde ENCRYPTION_KEY (o BETTER_AUTH_SECRET como fallback).
//   - Formato almacenado: `v1:<iv b64url>:<tag b64url>:<ciphertext b64url>`
//     El prefijo `v1:` permite detectar de forma robusta si un valor ya está cifrado
//     (a diferencia de un simple `hex:hex`, que podría colisionar con texto plano).
//
// decryptSecret() es tolerante: si el valor NO tiene formato `v1:...`, lo devuelve
// tal cual (texto plano heredado). Así las filas existentes en texto plano siguen
// funcionando y se cifran de forma perezosa al reescribirlas.

import crypto from 'crypto'

const VERSION_PREFIX = 'v1'
const IV_BYTES = 12 // longitud recomendada para GCM
const TAG_BYTES = 16

// Fallback documentado (mismo patrón que lib/auth.ts). En producción se debe
// definir ENCRYPTION_KEY en el entorno; sin ella, rotarla dejaría los valores ilegibles.
const FALLBACK_KEY_MATERIAL = 'pos-dian-credentials-encryption-key-2026'

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const material =
    process.env.ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET || FALLBACK_KEY_MATERIAL
  cachedKey = crypto.createHash('sha256').update(material, 'utf8').digest()
  return cachedKey
}

/** Envuelve un buffer en base64url (sin padding, seguro para URLs/DB). */
function toB64(buf: Buffer): string {
  return buf.toString('base64url')
}

function fromB64(s: string): Buffer {
  return Buffer.from(s, 'base64url')
}

/** Devuelve true si el valor tiene formato de ciphertext soportado (`v1:...`). */
export function isEncrypted(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false
  const parts = value.split(':')
  return parts.length === 4 && parts[0] === VERSION_PREFIX
}

/** Cifra un texto plano. Devuelve `v1:<iv>:<tag>:<ct>`. */
export function encryptSecret(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === '') return plaintext ?? null
  // Idempotente: si ya está cifrado, no re-cifrar (evita doble cifrado en round-trips).
  if (isEncrypted(plaintext)) return plaintext

  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${VERSION_PREFIX}:${toB64(iv)}:${toB64(tag)}:${toB64(ct)}`
}

/** Descifra un valor. Si no está en formato ciphertext, lo devuelve tal cual (texto plano heredado). */
export function decryptSecret(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return value ?? null
  if (!isEncrypted(value)) return value // texto plano heredado / valor no cifrado

  const [prefix, ivB64, tagB64, ctB64] = value.split(':')
  if (prefix !== VERSION_PREFIX) return value

  try {
    const iv = fromB64(ivB64)
    const tag = fromB64(tagB64)
    const ct = fromB64(ctB64)
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new Error('Longitud de IV/tag inválida')
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv)
    decipher.setAuthTag(tag)
    const pt = Buffer.concat([decipher.update(ct), decipher.final()])
    return pt.toString('utf8')
  } catch (err: any) {
    // Clave incorrecta o ciphertext corrupto/manipulado (GCM falla la autenticación).
    throw new Error(
      `No se pudo descifrar el valor almacenado (clave de cifrado incorrecta o dato dañado): ${err?.message ?? err}`
    )
  }
}

/** Descifra tolerando errores: si falla, devuelve null en vez de lanzar (para lecturas no críticas). */
export function decryptSecretSafe(value: string | null | undefined): string | null {
  try {
    return decryptSecret(value)
  } catch {
    return null
  }
}
