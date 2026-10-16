'use client'

import { useState, useEffect } from 'react'
import { OutboxQueueManager, OfflineSyncDaemon } from '../packages/sync-engine/src'

const globalQueueManager = new OutboxQueueManager()
const globalSyncDaemon = new OfflineSyncDaemon(globalQueueManager)

export function useSyncManager() {
  const [isOnline, setIsOnline] = useState<boolean>(true)
  const [queueSummary, setQueueSummary] = useState(globalQueueManager.getQueueSummary())

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine)

      const handleOnline = () => setIsOnline(true)
      const handleOffline = () => setIsOnline(false)

      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)

      globalSyncDaemon.startDaemon(() => {
        setQueueSummary(globalQueueManager.getQueueSummary())
      })

      return () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }
  }, [])

  const enqueueOfflineSale = (salePayload: any) => {
    const item = globalQueueManager.enqueue('SALE_TRANSACTION', salePayload)
    setQueueSummary(globalQueueManager.getQueueSummary())
    return item
  }

  const triggerManualSync = () => {
    setQueueSummary(globalQueueManager.getQueueSummary())
  }

  return {
    isOnline,
    queueSummary,
    enqueueOfflineSale,
    triggerManualSync,
  }
}
