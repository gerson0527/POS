import crypto from 'crypto'

export interface BackupPackage {
  backupId: string
  tenantId: string
  timestamp: string
  checksumSha256: string
  encryptedPayloadHex: string
}

export class BackupEngine {
  private encryptionKey: Buffer

  constructor(secretKey?: string) {
    const raw = secretKey || 'ENTERPRISE_POS_BACKUP_MASTER_KEY_2026'
    this.encryptionKey = crypto.createHash('sha256').update(raw).digest()
  }

  createEncryptedBackup(tenantId: string, sqliteDatabaseContentStr: string): BackupPackage {
    const backupId = `bkp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    const timestamp = new Date().toISOString()

    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv)
    let encrypted = cipher.update(sqliteDatabaseContentStr, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const encryptedPayloadHex = `${iv.toString('hex')}:${encrypted}`

    const checksumSha256 = crypto.createHash('sha256').update(encryptedPayloadHex).digest('hex')

    return {
      backupId,
      tenantId,
      timestamp,
      checksumSha256,
      encryptedPayloadHex,
    }
  }
}
