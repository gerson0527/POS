import { ISaleRepository, IHardwareDriver, CreateSaleDTO, SaleResult } from '../../packages/shared-domain/src/interfaces/repository.interface'
import { createSale } from '@/app/actions/pos-actions'

/**
 * Web API Implementation of SaleRepository
 * Used when app is running in standard Web Browser mode
 */
export class WebSaleRepository implements ISaleRepository {
  async createSale(dto: CreateSaleDTO): Promise<SaleResult> {
    const res = await createSale({
      locationId: dto.locationId || 'loc_bogota_01',
      items: (dto.lines || []).map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
      })),
      notes: dto.paymentReference ? `Ref: ${dto.paymentReference}` : undefined,
    })
    if (!res.success) throw new Error(res.message)
    return {
      id: res.saleId,
      ticketNumber: res.ticketNumber,
      createdAt: new Date(),
    }
  }

  async getSaleById(id: string): Promise<any> {
    return null
  }

  async getPendingOfflineSales(): Promise<any[]> {
    return []
  }

  async markSalesAsSynced(saleIds: string[]): Promise<void> {}
}

/**
 * Tauri Desktop Implementation of SaleRepository
 * Uses Tauri IPC commands to interact with Rust Core & local SQLite
 */
export class TauriDesktopSaleRepository implements ISaleRepository {
  async createSale(dto: CreateSaleDTO): Promise<SaleResult> {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      const res = await (window as any).__TAURI__.core.invoke('create_local_sale', { dto })
      return res
    }
    // Fallback to Web Repository if not in Tauri
    return new WebSaleRepository().createSale(dto)
  }

  async getSaleById(id: string): Promise<any> {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      return await (window as any).__TAURI__.core.invoke('get_local_sale', { id })
    }
    return null
  }

  async getPendingOfflineSales(): Promise<any[]> {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      return await (window as any).__TAURI__.core.invoke('get_pending_offline_sales')
    }
    return []
  }

  async markSalesAsSynced(saleIds: string[]): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      await (window as any).__TAURI__.core.invoke('mark_sales_as_synced', { saleIds })
    }
  }
}

/**
 * Web Browser Implementation of Hardware Driver
 */
export class WebHardwareDriver implements IHardwareDriver {
  async printTicket(saleData: any): Promise<boolean> {
    if (typeof window !== 'undefined') {
      window.print()
      return true
    }
    return false
  }

  async openCashDrawer(): Promise<boolean> {
    console.warn('[WebHardwareDriver] Cash drawer pulse requires native Tauri desktop driver or USB printer DK port.')
    return false
  }

  async getScaleWeight(): Promise<number> {
    return 0
  }
}

/**
 * Tauri Native Desktop Driver
 * Communicates directly with Rust hardware commands (ESC/POS, COM serial scales, USB RJ11 relays)
 */
export class TauriNativeHardwareDriver implements IHardwareDriver {
  async printTicket(saleData: any): Promise<boolean> {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      return await (window as any).__TAURI__.core.invoke('print_escpos_ticket', { saleData })
    }
    return new WebHardwareDriver().printTicket(saleData)
  }

  async openCashDrawer(): Promise<boolean> {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      return await (window as any).__TAURI__.core.invoke('open_cash_drawer_pulse')
    }
    return false
  }

  async getScaleWeight(): Promise<number> {
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      return await (window as any).__TAURI__.core.invoke('read_serial_scale_weight')
    }
    return 0
  }
}

/**
 * Adapter Factory: Automatically detects runtime environment (Tauri Desktop vs Web Browser)
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).__TAURI__)
}

export function getSaleRepository(): ISaleRepository {
  return isTauriEnvironment() ? new TauriDesktopSaleRepository() : new WebSaleRepository()
}

export function getHardwareDriver(): IHardwareDriver {
  return isTauriEnvironment() ? new TauriNativeHardwareDriver() : new WebHardwareDriver()
}
