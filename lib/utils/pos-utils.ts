// generateCUFE se movió a lib/fiscal/cufe.ts (Fase 4.25: única fórmula de CUFE).

/**
 * Genera el número secuencial de factura sin saltos
 * Usa número actual + 1 con validación de rango
 */
export function getNextInvoiceNumber(
  currentNumber: number,
  startRange: number,
  endRange: number
): { nextNumber: number; isValid: boolean; error?: string } {
  const nextNumber = currentNumber + 1

  if (nextNumber > endRange) {
    return {
      nextNumber,
      isValid: false,
      error: `Numeración agotada. Rango final: ${endRange}`
    }
  }

  if (nextNumber < startRange) {
    return {
      nextNumber: startRange,
      isValid: true
    }
  }

  return { nextNumber, isValid: true }
}

/**
 * Redondea un valor a la centena ($100 COP) más cercana sin centavos
 * Regla comercial colombiana para cobros y facturación física/electrónica
 */
export function roundToNearest100(amount: number): number {
  if (isNaN(amount) || amount === null || amount === undefined) return 0
  return Math.round(amount / 100) * 100
}

/**
 * Calcula totales de venta con IVA y redondeo obligatorio a la centena ($100)
 */
export function calculateSaleTotals(
  items: Array<{
    quantity: number
    unitPrice: number
    ivaRate: number
  }>,
  discountPercentage: number = 0
): {
  subtotal: number
  taxAmount: number
  total: number
  discountAmount: number
} {
  let subtotal = 0
  let taxAmount = 0

  for (const item of items) {
    const lineSubtotal = item.quantity * item.unitPrice
    const lineTax = lineSubtotal * (item.ivaRate / 100)

    subtotal += lineSubtotal
    taxAmount += lineTax
  }

  const discountAmount = subtotal * (discountPercentage / 100)
  const rawTotal = subtotal + taxAmount - discountAmount
  const roundedTotal = roundToNearest100(rawTotal)

  return {
    subtotal: Math.round(subtotal),
    taxAmount: Math.round(taxAmount),
    total: roundedTotal,
    discountAmount: Math.round(discountAmount)
  }
}

/**
 * Formatea moneda colombiana redondeada a la centena ($100) más cercana sin centavos
 */
export function formatCOP(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return '$ 0'
  const rounded = roundToNearest100(amount)
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(rounded)
}

/**
 * Formatea número de factura con prefijo
 */
export function formatInvoiceNumber(prefix: string, number: number, padLength: number = 8): string {
  return `${prefix}${String(number).padStart(padLength, '0')}`
}

/**
 * Valida NIT colombiano (formato: X.XXX.XXX.XXX o XXXXXXXXXX)
 */
export function validateNIT(nit: string): boolean {
  // Remover puntos
  const cleanNit = nit.replace(/\./g, '')

  // Debe ser 10 dígitos
  if (!/^\d{10}$/.test(cleanNit)) {
    return false
  }

  // Algoritmo de verificación (dígito verificador)
  const sequence = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47]
  let sum = 0

  for (let i = 0; i < 10; i++) {
    sum += Number(cleanNit[i]) * sequence[i]
  }

  const remainder = sum % 11
  const verificationDigit = remainder === 0 ? 0 : remainder === 1 ? 3 : 11 - remainder

  return Number(cleanNit[9]) === verificationDigit
}

/**
 * Calcula IVA de un valor
 */
export function calculateIVA(baseAmount: number, ivaRate: number): number {
  return Number((baseAmount * (ivaRate / 100)).toFixed(2))
}

/**
 * Genera ID único (ULID-like)
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Formatea fecha para DIAN (YYYY-MM-DD)
 */
export function formatDateDIAN(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Formatea hora para DIAN (HH:mm:ss)
 */
export function formatTimeDIAN(date: Date): string {
  return date.toISOString().split('T')[1].split('.')[0]
}

/**
 * Valida si la numeración está activa y disponible
 */
export function validateNumeration(
  currentNumber: number,
  startRange: number,
  endRange: number
): { isValid: boolean; error?: string } {
  if (currentNumber < startRange || currentNumber > endRange) {
    return {
      isValid: false,
      error: `Numeración fuera de rango. Rango: ${startRange}-${endRange}, Actual: ${currentNumber}`
    }
  }

  return { isValid: true }
}

/**
 * Calcula ticket número secuencial por sesión de caja
 */
export function getTicketNumber(sessionNumber: number, itemInSession: number): number {
  return sessionNumber * 1000 + itemInSession
}

/**
 * Genera QR content para factura (UBL compatible)
 */
export function generateQRContent(
  cufe: string,
  invoiceNumber: string,
  issueDate: string,
  totalAmount: string,
  taxpayerIdentification: string
): string {
  // Formato estándar DIAN para QR
  return `${cufe}|${invoiceNumber}|${issueDate}|${totalAmount}|${taxpayerIdentification}`
}

/**
 * Serializa BigDecimal para almacenamiento
 */
export function serializeDecimal(value: number): string {
  return value.toFixed(2)
}

/**
 * Deserializa BigDecimal de almacenamiento
 */
export function deserializeDecimal(value: string | number): number {
  return Number(value)
}
