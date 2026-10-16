'use client'

import { useState, useEffect } from 'react'
import {
  generateHardwareFingerprint,
  SecurityVaultManager,
  LicenseValidator,
  LicensePayload,
  LicenseValidationResult,
} from '../packages/security-vault/src'

const vaultManager = new SecurityVaultManager()
const licenseValidator = new LicenseValidator()

export function useSecurityVault() {
  const [hardwareFingerprint, setHardwareFingerprint] = useState<string>('')
  const [licenseStatus, setLicenseStatus] = useState<LicenseValidationResult | null>(null)

  useEffect(() => {
    const fp = generateHardwareFingerprint({
      cpuModel: 'Intel Core i7 POS Terminal',
      osPlatform: 'Windows_11_Enterprise',
      macAddress: 'AA:BB:CC:DD:EE:FF',
      systemUuid: 'POS-HW-99482-COLOMBIA',
    })
    setHardwareFingerprint(fp)

    // Demo sample license payload bound to this hardware fingerprint
    const sampleLicense: LicensePayload = {
      tenantId: 'tenant_bogota_01',
      tenantName: 'Comercializadora POS Retail S.A.S.',
      hardwareFingerprint: fp,
      allowedBranchesCount: 5,
      allowedPosTerminalsCount: 20,
      expiresAt: '2027-12-31T23:59:59Z',
      signatureEd25519: 'Ed25519_Sig_Sample_Valid_2026_DIAN_Enterprise',
    }

    const validation = licenseValidator.validateLicense(sampleLicense, fp)
    setLicenseStatus(validation)
  }, [])

  const encryptSecret = (val: string) => vaultManager.encryptSecret(val)
  const decryptSecret = (val: string) => vaultManager.decryptSecret(val)
  const storeDIANCertificate = (p12Base64: string, alias: string) =>
    vaultManager.storeDIANCertificate(p12Base64, alias)

  return {
    hardwareFingerprint,
    licenseStatus,
    encryptSecret,
    decryptSecret,
    storeDIANCertificate,
  }
}
