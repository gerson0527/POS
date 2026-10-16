'use client'

import { useState, useEffect } from 'react'
import {
  MetricsCollector,
  EncryptedRotatingLogger,
  SystemHealthChecker,
  SubsystemHealth,
} from '../packages/telemetry-analytics/src'

const metricsCollector = new MetricsCollector()
const rotatingLogger = new EncryptedRotatingLogger()
const healthChecker = new SystemHealthChecker()

export function useTelemetryDiagnostics() {
  const [metricsSummary, setMetricsSummary] = useState(metricsCollector.getMetricsSummary())
  const [healthStatus, setHealthStatus] = useState<SubsystemHealth[]>([])
  const [recentLogs, setRecentLogs] = useState(rotatingLogger.getRecentLogs(20))

  useEffect(() => {
    runDiagnostics()
    const interval = setInterval(runDiagnostics, 15000)
    return () => clearInterval(interval)
  }, [])

  async function runDiagnostics() {
    setMetricsSummary(metricsCollector.getMetricsSummary())
    const health = await healthChecker.checkAllSubsystems()
    setHealthStatus(health)
    setRecentLogs(rotatingLogger.getRecentLogs(20))
  }

  const recordCheckoutLatency = (durationMs: number) => {
    metricsCollector.recordMetric('checkout_duration', durationMs)
    setMetricsSummary(metricsCollector.getMetricsSummary())
  }

  const logSystemMessage = (level: 'INFO' | 'WARN' | 'ERROR' | 'SECURITY', moduleName: string, msg: string, details?: any) => {
    rotatingLogger.log(level, moduleName, msg, details)
    setRecentLogs(rotatingLogger.getRecentLogs(20))
  }

  return {
    metricsSummary,
    healthStatus,
    recentLogs,
    recordCheckoutLatency,
    logSystemMessage,
    exportLogs: () => rotatingLogger.exportLogsAsJSON(),
  }
}
