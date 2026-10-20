// Reglas compartidas de numeración local.
// La numeración electrónica oficial la asigna el proveedor (Factus): estos rangos
// solo controlan comprobantes internos y documentos no electrónicos del POS.

// Valores alineados con el enum FiscalDocumentType de la BD.
export const NUMERATION_DOCUMENT_TYPES = [
  'FACTURA_ELECTRONICA_VENTA',
  'DOCUMENTO_EQUIVALENTE_POS',
  'NOTA_CREDITO',
  'NOTA_DEBITO',
  'NOTA_AJUSTE',
] as const

export type NumerationDocumentType = (typeof NUMERATION_DOCUMENT_TYPES)[number]

export const NUMERATION_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  FACTURA_ELECTRONICA_VENTA: 'FACTURA ELECTRÓNICA DE VENTA',
  DOCUMENTO_EQUIVALENTE_POS: 'DOCUMENTO EQUIVALENTE POS / COMPROBANTE INTERNO',
  NOTA_CREDITO: 'NOTA CRÉDITO ELECTRÓNICA',
  NOTA_DEBITO: 'NOTA DÉBITO ELECTRÓNICA',
  NOTA_AJUSTE: 'NOTA AJUSTE',
}

// Consecutivo interno del POS (tickets/comprobantes que no transmite Factus).
// Cuando Factus emite la factura, el documento se actualiza con el número oficial.
export const INTERNAL_NUMERATION = {
  resolution: 'VENTA-INTERNA-POS',
  prefix: 'REC',
  documentType: 'DOCUMENTO_EQUIVALENTE_POS',
  startRange: 1,
  endRange: 999999,
} as const

export interface NumerationValues {
  resolution: string
  prefix: string
  startRange: number
  endRange: number
  currentNumber: number
  documentType: NumerationDocumentType
  status: 'ACTIVE' | 'INACTIVE'
}

export interface NumerationInput {
  resolution: string
  prefix: string
  startRange: number
  endRange: number
  currentNumber?: number
  documentType: string
  status?: string
}

const PREFIX_PATTERN = /^[A-Z0-9]{1,10}$/

export function normalizeNumerationInput(input: NumerationInput): NumerationValues {
  const resolution = String(input.resolution ?? '').trim()
  if (!resolution) throw new Error('El número o referencia de la resolución es obligatorio.')
  if (resolution.length > 120) throw new Error('La resolución no puede superar 120 caracteres.')

  const prefix = String(input.prefix ?? '').trim().toUpperCase()
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new Error('El prefijo debe tener entre 1 y 10 caracteres alfanuméricos, sin espacios.')
  }

  const startRange = Number(input.startRange)
  const endRange = Number(input.endRange)
  if (!Number.isInteger(startRange) || startRange < 1) {
    throw new Error('El rango inicial debe ser un entero mayor o igual a 1.')
  }
  if (!Number.isInteger(endRange) || endRange < startRange) {
    throw new Error('El rango final debe ser un entero mayor o igual al rango inicial.')
  }

  const currentNumber = input.currentNumber === undefined ? startRange - 1 : Number(input.currentNumber)
  if (!Number.isInteger(currentNumber) || currentNumber < startRange - 1 || currentNumber > endRange) {
    throw new Error(
      `El consecutivo actual debe estar entre ${startRange - 1} y ${endRange}. Use ${startRange - 1} si aún no se ha emitido ninguno.`
    )
  }

  const documentType = String(input.documentType ?? '').trim() as NumerationDocumentType
  if (!NUMERATION_DOCUMENT_TYPES.includes(documentType)) {
    throw new Error('El tipo de documento de la numeración no es válido.')
  }

  const status = String(input.status ?? 'ACTIVE').trim() as 'ACTIVE' | 'INACTIVE'
  if (status !== 'ACTIVE' && status !== 'INACTIVE') {
    throw new Error('El estado de la numeración debe ser ACTIVE o INACTIVE.')
  }

  return { resolution, prefix, startRange, endRange, currentNumber, documentType, status }
}

export function isInternalNumeration(values: { resolution: string; prefix: string }): boolean {
  return values.resolution === INTERNAL_NUMERATION.resolution && values.prefix === INTERNAL_NUMERATION.prefix
}
