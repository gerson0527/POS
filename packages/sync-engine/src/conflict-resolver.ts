export interface VersionedEntity {
  id: string
  updatedAt: Date | string
  version: number
}

export class ConflictResolver {
  /**
   * Resolves conflicts for master catalog items using Last-Write-Wins (LWW)
   */
  resolveLastWriteWins<T extends VersionedEntity>(localItem: T, remoteItem: T): T {
    const localTime = new Date(localItem.updatedAt).getTime()
    const remoteTime = new Date(remoteItem.updatedAt).getTime()

    if (remoteTime >= localTime) {
      return remoteItem
    }
    return localItem
  }

  /**
   * Financial & Sales Transactions are Append-Only (Immutable).
   * They must never overwrite existing sales; they only append new records.
   */
  isAppendOnlyTransaction(entityType: string): boolean {
    return entityType === 'SALE' || entityType === 'PAYMENT' || entityType === 'FISCAL_DOCUMENT'
  }
}
