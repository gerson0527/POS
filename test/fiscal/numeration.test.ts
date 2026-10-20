import { describe, expect, it } from 'vitest'
import {
  INTERNAL_NUMERATION,
  NUMERATION_DOCUMENT_TYPES,
  isInternalNumeration,
  normalizeNumerationInput,
} from '@/lib/fiscal/numeration'

const base = {
  resolution: 'VENTA-INTERNA-POS',
  prefix: 'rec',
  startRange: 1,
  endRange: 999999,
  documentType: 'DOCUMENTO_EQUIVALENTE_POS',
}

describe('normalizeNumerationInput', () => {
  it('normaliza prefijo a mayúsculas y usa startRange - 1 por defecto', () => {
    const values = normalizeNumerationInput(base)
    expect(values.prefix).toBe('REC')
    expect(values.currentNumber).toBe(0)
    expect(values.status).toBe('ACTIVE')
  })

  it('permite currentNumber dentro del rango', () => {
    const values = normalizeNumerationInput({ ...base, startRange: 10, currentNumber: 15 })
    expect(values.currentNumber).toBe(15)
  })

  it('rechaza prefijos inválidos', () => {
    expect(() => normalizeNumerationInput({ ...base, prefix: 'REC 1' })).toThrow()
    expect(() => normalizeNumerationInput({ ...base, prefix: '' })).toThrow()
    expect(() => normalizeNumerationInput({ ...base, prefix: 'PREFIJO12345' })).toThrow()
  })

  it('rechaza rangos invertidos', () => {
    expect(() => normalizeNumerationInput({ ...base, startRange: 100, endRange: 10 })).toThrow()
  })

  it('rechaza currentNumber fuera del rango', () => {
    expect(() => normalizeNumerationInput({ ...base, startRange: 10, currentNumber: 8 })).toThrow()
    expect(() => normalizeNumerationInput({ ...base, endRange: 5, currentNumber: 6 })).toThrow()
  })

  it('rechaza tipos de documento fuera del enum', () => {
    expect(() => normalizeNumerationInput({ ...base, documentType: 'INVOICE' })).toThrow()
    expect(() => normalizeNumerationInput({ ...base, documentType: 'COMPROBANTE_INTERNO' })).toThrow()
  })

  it('rechaza estados inválidos', () => {
    expect(() => normalizeNumerationInput({ ...base, status: 'BORRADA' })).toThrow()
  })
})

describe('INTERNAL_NUMERATION', () => {
  it('usa un tipo de documento válido para la BD', () => {
    expect(NUMERATION_DOCUMENT_TYPES).toContain(INTERNAL_NUMERATION.documentType)
  })

  it('se reconoce como numeración interna por resolución + prefijo', () => {
    expect(isInternalNumeration(INTERNAL_NUMERATION)).toBe(true)
    expect(isInternalNumeration({ resolution: '18764000001', prefix: 'SETP' })).toBe(false)
  })
})
