export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SECURITY'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  moduleName: string
  message: string
  details?: any
}

export class EncryptedRotatingLogger {
  private logsBuffer: LogEntry[] = []

  log(level: LogLevel, moduleName: string, message: string, details?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      moduleName,
      message,
      details,
    }
    this.logsBuffer.push(entry)
    if (this.logsBuffer.length > 1000) {
      this.logsBuffer.shift() // Rotative memory buffer
    }

    if (level === 'ERROR' || level === 'SECURITY') {
      console.error(`[${entry.timestamp}] [${level}] [${moduleName}]: ${message}`, details || '')
    }
  }

  getRecentLogs(limit: number = 50): LogEntry[] {
    return this.logsBuffer.slice(-limit)
  }

  exportLogsAsJSON(): string {
    return JSON.stringify(this.logsBuffer, null, 2)
  }
}
