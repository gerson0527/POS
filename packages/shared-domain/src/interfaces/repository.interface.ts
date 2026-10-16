export interface SaleLineDTO {
  productId: string
  quantity: number
  unitPrice: number
  ivaRate: number
  ivaAmount: number
  lineTotal: number
}

export interface CreateSaleDTO {
  tenantId: string
  locationId: string
  cashierSessionId: string
  customerId?: string
  customerName?: string
  customerDocument?: string
  paymentMethod: string
  paymentReference?: string
  subtotal: number
  taxAmount: number
  discountAmount: number
  total: number
  lines: SaleLineDTO[]
}

export interface SaleResult {
  id: string
  ticketNumber: number
  cude?: string
  qrCodeUrl?: string
  createdAt: Date
}

export interface ISaleRepository {
  createSale(dto: CreateSaleDTO): Promise<SaleResult>
  getSaleById(id: string): Promise<any>
  getPendingOfflineSales(): Promise<any[]>
  markSalesAsSynced(saleIds: string[]): Promise<void>
}

export interface IHardwareDriver {
  printTicket(saleData: any): Promise<boolean>
  openCashDrawer(): Promise<boolean>
  getScaleWeight(): Promise<number>
}
