// Invoice Provider abstraction — interfaces compartidas
// Los proveedores concretos (Factus, Siigo, etc.) se acoplan a estas interfaces
// y se seleccionan vía lib/invoicing/index.ts según la configuración del tenant.

export type PaymentMethodCode =
  | '10' // Efectivo
  | '42' // Consignación/Transferencia
  | '47' // Nequi
  | '48' // Tarjeta crédito
  | '49' // Tarjeta débito
  | '71' // Bonos
  | string

export type PaymentFormCode =
  | '1' // Contado
  | '2' // Crédito

export interface InvoiceItemPayload {
  /** Código de referencia del producto (en Factus: code_reference). Aquí usamos product.sku. */
  code_reference: string
  /** Nombre descriptivo del producto. */
  name: string
  /** Cantidad (en la API va como string con 2 decimales: "1.00"). */
  quantity: number | string
  /** Precio unitario SIN impuestos (en la API va como string con 2 decimales: "10000.00"). */
  price: number | string
  /** Tasa de descuento del ítem (0.00 por defecto, va como string). */
  discount_rate?: number | string
  /** Código de unidad de medida (default: 94=Unidad). */
  unit_measure_code?: string
  /** Código estándar del producto (default: 999). */
  standard_code?: string
  /** ID del esquema (UNSPSC, etc.). Default: 0=Ninguno. Va como string en la API. */
  scheme_id?: string | number
  /** Impuestos aplicados al ítem. */
  taxes: InvoiceItemTaxPayload[]
}

export interface InvoiceItemTaxPayload {
  /** '01' = IVA, '04' = INC (Impoconsumo). */
  code: string
  /** Tasa en string con 2 decimales: '19.00'. */
  rate: string
  /** true si el ítem está excluido de este impuesto. */
  is_excluded?: boolean
}

export interface InvoiceCustomerPayload {
  /** Código del tipo de documento: 13=CC, 31=NIT, 22=CE, 41=Pasaporte. */
  identification_document_code: string
  /** Número de identificación SIN dígito de verificación (DV separado si NIT). */
  identification: string
  /** Dígito de verificación (solo NIT). */
  dv?: string
  /** Razón social (persona jurídica). */
  company?: string
  /** Nombre comercial. */
  trade_name?: string
  /** Nombres (persona natural). */
  names?: string
  /** Apellidos (persona natural). */
  surnames?: string
  /** Dirección del cliente. */
  address: string
  /** Email del cliente. */
  email: string
  /** Teléfono. */
  phone?: string
  /** '1' = Persona Jurídica, '2' = Persona Natural. */
  legal_organization_code: string
  /** Código de tributo del cliente (ZZ=No aplica, 01=IVA, etc.). */
  tribute_code: string
  /** Código DANE del municipio (ej 11001 = Bogotá). */
  municipality_code: string
}

export interface InvoicePaymentDetailPayload {
  /** '1' = Contado, '2' = Crédito. Siempre string en la API. */
  payment_form: PaymentFormCode | string
  /** Código del método de pago (10=Efectivo, 42=Transferencia, etc.). */
  payment_method_code: PaymentMethodCode | string
  /** Referencia opcional del pago. */
  reference_code?: string
  /** Monto (en la API va como string con 2 decimales: "83300.00"). */
  amount: number | string
  /** Fecha de vencimiento para pago a crédito (YYYY-MM-DD). */
  due_date?: string
}

export interface InvoicePayload {
  /** ID del rango de numeración configurado en el proveedor. */
  numbering_range_id: number
  /** Código único referenciado a la venta POS (ej FACT-2026-0001). */
  reference_code: string
  /** '01' = Factura de Venta. */
  document: string
  /** '10' = Estándar. */
  operation_type: string
  /** Enviar la factura por email al cliente automáticamente. */
  send_email?: boolean
  /** Observaciones de la factura. */
  observation?: string
  /** Ajuste de redondeo de caja (Factus: ±500.00). Se suma al total de ítems. */
  cash_rounding_amount?: number | string
  /** Detalle de pagos. */
  payment_details: InvoicePaymentDetailPayload[]
  /** Datos del cliente. */
  customer: InvoiceCustomerPayload
  /** Ítems vendidos. */
  items: InvoiceItemPayload[]
}

export interface InvoiceResult {
  success: boolean
  /** Código único de la factura electrónica (CUFE) si fue exitoso. */
  cufe?: string
  /** URL al código QR. */
  qrCodeUrl?: string
  /** URL al PDF firmado. */
  pdfUrl?: string
  /** URL al XML firmado. */
  xmlUrl?: string
  /** Estado devuelto por el proveedor (ej: ACCEPTED, REJECTED, PENDING). */
  dianStatus?: string
  /** Número completo de la factura (prefijo + consecutivo). */
  billNumber?: string
  /** Mensaje legible para humanos. */
  message: string
  /** ID del proveedor (útil para trazabilidad). */
  providerId?: string
  /** Respuesta cruda del proveedor (solo debug). */
  rawResponse?: unknown
  /** Id de correlación de la emisión (UUID) para auditoría y soporte. */
  correlationId?: string
  /** El resultado externo no se pudo determinar (timeout, red, 5xx). */
  uncertain?: boolean
  /** El outbox debe reconciliar por reference_code antes de reenviar. */
  needsReconciliation?: boolean
  /**
   * NO_PROVIDER: el tenant no tiene Factus/FE configurado.
   * No es un fallo DIAN: no reintentar ni mostrar REINTENTAR en facturas.
   */
  code?: 'NO_PROVIDER'
}

export interface InvoiceProviderConfig {
  /** Identificador del proveedor (ej: 'factus-v2'). */
  providerId: 'factus-v2' | 'disabled'
  /** URL base del API del proveedor. */
  baseUrl: string
  /** 'sandbox' o 'production'. */
  environment: 'sandbox' | 'production'
  /** Credenciales OAuth2 / client credentials. */
  clientId: string
  clientSecret: string
  /** Usuario + contraseña para el password grant de Factus. */
  username: string
  password: string
  /** ID del rango de numeración obtenido del proveedor. */
  numberingRangeId: number
  /** Código del vendedor en el proveedor (NIT). */
  sellerNit: string
  /** Prefijo del rango de numeración. */
  numberingPrefix: string
}

export interface InvoiceProvider {
  readonly providerId: string
  readonly displayName: string
  /** Rango de numeración resuelto (.env + override del tenant). */
  readonly numberingRangeId: number
  /** Valida credenciales/dependencias sin emitir factura real. */
  testConnection(): Promise<{ ok: boolean; message: string }>
  /** Emite la factura electrónica según el payload. */
  sendInvoice(payload: InvoicePayload): Promise<InvoiceResult>
  /** Busca una factura ya emitida por reference_code (reconciliación). */
  lookupBillByReference?(referenceCode: string): Promise<InvoiceResult | null>
  /** Lista los rangos de numeración disponibles (útil durante la configuración). */
  listNumberingRanges(): Promise<
    Array<{
      id: number
      prefix: string
      from: number
      to: number
      /** Siguiente número del rango (último asignado = current - 1). */
      current: number
      status: string
      document?: string
    }>
  >
}

// Errores tipados para manejo uniforme
export class InvoiceProviderError extends Error {
  status?: number
  code?: string
  providerId?: string
  raw?: unknown
  constructor(message: string, opts: { status?: number; code?: string; providerId?: string; raw?: unknown } = {}) {
    super(message)
    this.name = 'InvoiceProviderError'
    this.status = opts.status
    this.code = opts.code
    this.providerId = opts.providerId
    this.raw = opts.raw
  }
}
