// cufe.ts — Generación del CUFE/CUDE (Fase 4.25, §7.1).
//
// Única fórmula de CUFE del sistema (antes en lib/utils/pos-utils.ts).
// El CUFE remoto que devuelve Factus en su respuesta NO pasa por aquí.

import crypto from 'crypto'

/**
 * Genera el CUFE (Código Único de Facturación Electrónica) o CUDE (para POS electrónico / Notas)
 * Algoritmo oficial DIAN: SHA-384 de concatenación de campos con Clave Técnica
 */
export function generateCUFE(
  nit: string,
  invoiceNumber: string,
  issueDate: string,
  dueDate: string,
  taxableAmount: string,
  taxAmount: string,
  lineExtensionAmount: string,
  payableAmount: string,
  softwareCode: string,
  nonce: string,
  businessKey: string,
  claveTecnica: string = ''
): string {
  const concatenated = `${nit}${invoiceNumber}${issueDate}${dueDate}${taxableAmount}${taxAmount}${lineExtensionAmount}${payableAmount}${softwareCode}${nonce}${businessKey}${claveTecnica}`

  return crypto.createHash('sha384').update(concatenated).digest('hex').toUpperCase()
}

// URLs del catálogo DIAN para el QR (documentkey = CUFE). Factus devuelve
// exactamente esta URL en bill.qr / links.qr; aquí se deriva localmente para
// no perder el QR del ticket cuando el proveedor no la retorna (ej. facturas
// emitidas antes de guardar qrCodeContent).
const DIAN_QR_BASE: Record<'production' | 'sandbox', string> = {
  production: 'https://catalogo-vpfe.dian.gov.co',
  sandbox: 'https://catalogo-vpfe-hab.dian.gov.co',
}

/** URL de verificación DIAN para el QR de una factura electrónica (documentkey = CUFE). */
export function dianQrUrl(cufe: string, environment?: string | null): string {
  const base = DIAN_QR_BASE[environment === 'production' ? 'production' : 'sandbox']
  return `${base}/document/searchqr?documentkey=${cufe}`
}
