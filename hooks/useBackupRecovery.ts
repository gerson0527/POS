'use client'

import { useState } from 'react'
import { BackupEngine, RecoveryEngine, BackupPackage, RestoreResult } from '../packages/backup-recovery/src'

const backupEngine = new BackupEngine()
const recoveryEngine = new RecoveryEngine()

export function useBackupRecovery() {
  const [backups, setBackups] = useState<BackupPackage[]>([])
  const [lastRestoreResult, setLastRestoreResult] = useState<RestoreResult | null>(null)

  const createEncryptedBackup = (tenantId: string, sampleDataStr: string) => {
    const pkg = backupEngine.createEncryptedBackup(tenantId, sampleDataStr)
    setBackups((prev) => [pkg, ...prev])
    return pkg
  }

  const restoreFromBackup = (pkg: BackupPackage) => {
    const result = recoveryEngine.restoreFromEncryptedBackup(pkg)
    setLastRestoreResult(result)
    return result
  }

  const rebuildFromCloud = async (tenantId: string) => {
    const result = await recoveryEngine.rebuildFromCloudMasterCatalog(tenantId)
    setLastRestoreResult(result)
    return result
  }

  return {
    backups,
    lastRestoreResult,
    createEncryptedBackup,
    restoreFromBackup,
    rebuildFromCloud,
  }
}
