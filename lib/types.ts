// Enums & Types for POS System

export enum TenantStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED'
}

export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  CASHIER = 'CASHIER',
  INVENTORY_CLERK = 'INVENTORY_CLERK'
}

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DELETED = 'DELETED'
}

export enum CashierSessionStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  SUSPENDED = 'SUSPENDED'
}

export enum SaleStatus {
  DRAFT = 'DRAFT',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED'
}

export enum PaymentMethod {
  CASH = 'CASH',
  NEQUI = 'NEQUI',
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  CARD = 'CARD',
  TRANSFER = 'TRANSFER',
  CHEQUE = 'CHEQUE',
  MIXED = 'MIXED',
  STORE_CREDIT = 'STORE_CREDIT'
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSED = 'PROCESSED',
  DECLINED = 'DECLINED',
  REFUNDED = 'REFUNDED'
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT_DIAN = 'SENT_DIAN',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED'
}

export enum DocumentType {
  INVOICE = 'INVOICE',
  CREDIT_NOTE = 'CREDIT_NOTE',
  DEBIT_NOTE = 'DEBIT_NOTE'
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  CANCEL = 'CANCEL',
  PRINT = 'PRINT',
  SEND_DIAN = 'SEND_DIAN'
}

export enum EventType {
  SALE_CREATED = 'SALE_CREATED',
  SALE_COMPLETED = 'SALE_COMPLETED',
  PAYMENT_PROCESSED = 'PAYMENT_PROCESSED',
  INVOICE_GENERATED = 'INVOICE_GENERATED',
  INVOICE_SENT_DIAN = 'INVOICE_SENT_DIAN',
  INVOICE_ACCEPTED = 'INVOICE_ACCEPTED',
  INVENTORY_ADJUSTED = 'INVENTORY_ADJUSTED'
}

// DTOs
export interface CreateTenantDTO {
  name: string
  nit: string
  legalName: string
  email?: string
  phone?: string
  address?: string
}

export interface CreateProductDTO {
  sku: string
  barcode?: string
  categoryId?: string
  category?: string
  name: string
  description?: string
  unitPrice: number
  cost?: number
  margin?: number
  ivaRate?: number
  initialStock?: number
}

export interface UpdateProductDTO {
  name?: string
  sku?: string
  barcode?: string
  categoryId?: string
  category?: string
  description?: string
  unitPrice?: number
  cost?: number
  margin?: number
  ivaRate?: number
  status?: ProductStatus
}

export interface CreateLocationDTO {
  name: string
  code: string
  address?: string
  phone?: string
}

export interface InitInventoryDTO {
  locationId: string
  productId: string
  quantity: number
  reorderPoint?: number
}

export interface CreateSaleDTO {
  locationId: string
  items: {
    productId: string
    quantity: number
  }[]
  customer?: CustomerDTO
  allowWithoutStock?: boolean
  notes?: string
}

export interface CustomerDTO {
  documentType: string
  documentNumber: string
  name: string
  email?: string
  phone?: string
  address?: string
}

export interface AddSaleItemDTO {
  saleId: string
  productId: string
  quantity: number
}

export interface CompleteSaleDTO {
  saleId: string
  payments: {
    method: PaymentMethod
    amount: number
    reference?: string
  }[]
  discountPercentage?: number
}

export interface GenerateInvoiceDTO {
  saleId: string
  resolution: string
  prefix: string
}

// Responses
export interface APIResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: unknown
  }
}

export interface SaleResponse {
  id: string
  ticketNumber: number | null
  status: SaleStatus
  items: {
    productId: string
    productName: string
    quantity: number
    unitPrice: number
    lineTotal: number
    ivaRate: number
    ivaAmount: number
  }[]
  subtotal: number
  taxAmount: number
  total: number
  discountAmount: number
  discountPercentage: number
}

export interface InvoiceResponse {
  id: string
  cufe: string
  number: string
  status: InvoiceStatus
  xmlContent?: string
  pdfUrl?: string
  qrCode?: string
  dianResponse?: unknown
}

export interface NumerationResponse {
  id: string
  resolution: string
  prefix: string
  startRange: number
  endRange: number
  currentNumber: number
  available: number
}
