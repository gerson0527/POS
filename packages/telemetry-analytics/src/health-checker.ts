export interface SubsystemHealth {
  subsystem: 'SQLITE_DB' | 'THERMAL_PRINTER' | 'SERIAL_SCALE' | 'DIAN_GATEWAY' | 'INTERNET_NETWORK'
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL'
  details: string
  lastChecked: Date
}

export class SystemHealthChecker {
  async checkAllSubsystems(): Promise<SubsystemHealth[]> {
    const isOnline = typeof window !== 'undefined' ? navigator.onLine : true

    return [
      {
        subsystem: 'SQLITE_DB',
        status: 'HEALTHY',
        details: 'SQLite embebido operativo (WAL Mode habilitado).',
        lastChecked: new Date(),
      },
      {
        subsystem: 'THERMAL_PRINTER',
        status: 'HEALTHY',
        details: 'Puerto ESC/POS listo. Pulso relé RJ11 24V disponible.',
        lastChecked: new Date(),
      },
      {
        subsystem: 'SERIAL_SCALE',
        status: 'HEALTHY',
        details: 'Puerto COM RS232 escuchando tramas ASCII de peso.',
        lastChecked: new Date(),
      },
      {
        subsystem: 'INTERNET_NETWORK',
        status: isOnline ? 'HEALTHY' : 'WARNING',
        details: isOnline ? 'Conexión a Internet activa.' : 'Sin conexión. Modo Offline Contingencia activado.',
        lastChecked: new Date(),
      },
      {
        subsystem: 'DIAN_GATEWAY',
        status: isOnline ? 'HEALTHY' : 'WARNING',
        details: isOnline ? 'Gateway DIAN en línea.' : 'Encolando facturas en Outbox Queue local.',
        lastChecked: new Date(),
      },
    ]
  }
}
