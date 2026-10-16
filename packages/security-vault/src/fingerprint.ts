import crypto from 'crypto'

export interface MachineHardwareDetails {
  cpuModel?: string
  osPlatform?: string
  macAddress?: string
  systemUuid?: string
}

export function generateHardwareFingerprint(details: MachineHardwareDetails): string {
  const rawComponents = [
    details.systemUuid || 'default_sys_uuid',
    details.cpuModel || 'default_cpu',
    details.macAddress || '00:11:22:33:44:55',
    details.osPlatform || 'windows',
  ].join('||')

  const hash = crypto.createHash('sha256').update(rawComponents).digest('hex')
  return hash.toUpperCase()
}
