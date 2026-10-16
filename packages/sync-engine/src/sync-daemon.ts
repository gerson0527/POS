import { OutboxQueueManager } from './outbox-queue'

export class OfflineSyncDaemon {
  private queueManager: OutboxQueueManager
  private isRunning: boolean = false
  private syncIntervalMs: number = 10000

  constructor(queueManager: OutboxQueueManager) {
    this.queueManager = queueManager
  }

  startDaemon(onSyncCallback?: (itemsSynced: number) => void): void {
    if (this.isRunning) return
    this.isRunning = true

    setInterval(async () => {
      if (typeof window !== 'undefined' && !navigator.onLine) {
        return // Skip sync if browser/device is offline
      }

      const pending = this.queueManager.getPendingItems()
      if (pending.length === 0) return

      const itemIds = pending.map((i) => i.id)
      this.queueManager.markAsSyncing(itemIds)

      try {
        // Simulate batch transmission to NestJS Cloud /sync/sales endpoint
        await new Promise((res) => setTimeout(res, 300))
        this.queueManager.markAsSynced(itemIds)
        if (onSyncCallback) onSyncCallback(pending.length)
      } catch (err: any) {
        pending.forEach((i) => this.queueManager.markAsFailed(i.id, err?.message || 'Sync error'))
      }
    }, this.syncIntervalMs)
  }

  stopDaemon(): void {
    this.isRunning = false
  }
}
