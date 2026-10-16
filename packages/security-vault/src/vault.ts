import crypto from 'crypto'

export interface StoredCertificate {
  alias: string
  issuer: string
  validUntil: string
  encryptedP12Base64: string
}

export class SecurityVaultManager {
  private masterKey: Buffer

  constructor(masterKey?: string) {
    const rawKey = masterKey || 'SECURE_TPM_LOCAL_KEY_2026_ENTERPRISE_POS'
    this.masterKey = crypto.createHash('sha256').update(rawKey).digest()
  }

  encryptSecret(secretValue: string): string {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', this.masterKey, iv)
    let encrypted = cipher.update(secretValue, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return `${iv.toString('hex')}:${encrypted}`
  }

  decryptSecret(encryptedValue: string): string {
    const parts = encryptedValue.split(':')
    if (parts.length !== 2) return encryptedValue
    const iv = Buffer.from(parts[0], 'hex')
    const encryptedText = parts[1]
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.masterKey, iv)
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }

  storeDIANCertificate(p12Base64: string, alias: string): StoredCertificate {
    const encryptedP12Base64 = this.encryptSecret(p12Base64)
    return {
      alias,
      issuer: 'DIAN Subca Autoridad de Certificacion',
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      encryptedP12Base64,
    }
  }
}
