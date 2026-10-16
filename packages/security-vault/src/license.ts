export interface LicensePayload {
  tenantId: string
  tenantName: string
  hardwareFingerprint: string
  allowedBranchesCount: number
  allowedPosTerminalsCount: number
  expiresAt: string
  signatureEd25519: string
}

export interface LicenseValidationResult {
  isValid: boolean
  isExpired: boolean
  isHardwareMatched: boolean
  message: string
}

export class LicenseValidator {
  validateLicense(license: LicensePayload, currentHardwareFingerprint: string): LicenseValidationResult {
    const now = new Date()
    const expiry = new Date(license.expiresAt)
    const isExpired = now.getTime() > expiry.getTime()
    const isHardwareMatched = license.hardwareFingerprint.toUpperCase() === currentHardwareFingerprint.toUpperCase()

    const isValid = !isExpired && isHardwareMatched && Boolean(license.signatureEd25519)

    return {
      isValid,
      isExpired,
      isHardwareMatched,
      message: isValid
        ? 'Licencia Enterprise activa y verificada.'
        : isExpired
        ? 'La licencia del software ha expirado.'
        : !isHardwareMatched
        ? 'La licencia no corresponde al hardware de este equipo.'
        : 'Firma de licencia no válida.',
    }
  }
}
