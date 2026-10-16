export interface OutboxItem {
  id: string
  type: 'SALE_TRANSACTION' | 'DIAN_CONTINGENCY_INVOICE' | 'STOCK_MOVEMENT'
  payload: any
  status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED'
  retryCount: number
  lastError?: string
  createdAt: Date
  syncedAt?: Date
}

export class OutboxQueueManager {
  private queue: OutboxItem[] = []

  enqueue(type: OutboxItem['type'], payload: any): OutboxItem {
    const item: OutboxItem = {
      id: `outbox_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      payload,
      status: 'PENDING',
      retryCount: 0,
      createdAt: new Date(),
    }
    this.queue.push(item)
    return item
  }

  getPendingItems(): OutboxItem[] {
    return this.queue.filter((i) => i.status === 'PENDING' || i.status === 'FAILED')
  }

  markAsSyncing(ids: string[]): void {
    this.queue.forEach((item) => {
      if (ids.includes(item.id)) {
        item.status = 'SYNCING'
      }
    })
  }

  markAsSynced(ids: string[]): void {
    this.queue.forEach((item) => {
      if (ids.includes(item.id)) {
        item.status = 'SYNCED'
        item.syncedAt = new Date()
      }
    })
  }

  markAsFailed(id: string, error: string): void {
    const item = this.queue.find((i) => i.id === id)
    if (item) {
      item.status = 'FAILED'
      item.retryCount += 1
      item.lastError = error
    }
  }

  getQueueSummary() {
    return {
      total: this.queue.length,
      pending: this.queue.filter((i) => i.status === 'PENDING').length,
      syncing: this.queue.filter((i) => i.status === 'SYNCING').length,
      synced: this.queue.filter((i) => i.status === 'SYNCED').length,
      failed: this.queue.filter((i) => i.status === 'FAILED').length,
    }
  }
}
