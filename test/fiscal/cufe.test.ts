import { describe, expect, it } from 'vitest'
import { dianQrUrl, generateCUFE } from '@/lib/fiscal/cufe'

// Vectores baseline: SHA-384 de la concatenación oficial DIAN (misma fórmula que
// la función histórica de pos-utils). Si el hash cambia, cambió la fórmula.
describe('generateCUFE', () => {
  it('vector 1: factura con clave técnica', () => {
    const cufe = generateCUFE(
      '900123456',
      'FACT-00000001',
      '2026-01-15T08:00:00-05:00',
      '2026-01-15',
      '100000.00',
      '19000.00',
      '100000.00',
      '119000.00',
      'SENA-POS-01',
      'abc123',
      '123456789-10',
      'CLV-TEC-01'
    )
    expect(cufe).toBe(
      '92D4FE7FF1035B14DEC146C9980101BC0C5F9EC3A779DF38C3FCCFA25A9DC55B9AE49142CABD8B36D671CF5BB1D1011B'
    )
  })

  it('vector 2: sin clave técnica (default vacío)', () => {
    const cufe = generateCUFE(
      '800111222',
      'FACT-00000123',
      '2026-02-01T10:30:00-05:00',
      '2026-02-01',
      '0.00',
      '0.00',
      '0.00',
      '0.00',
      'POS-SW',
      'nonce-xyz',
      '800111222-9'
    )
    expect(cufe).toBe(
      '94DEE10FB57849572087D09216C5F49FD10B7333B0F5E383C9FD6533A05FD5772D8BFA1C1256415DBDB67F35F9D44C45'
    )
  })

  it('devuelve 96 caracteres hexadecimales en mayúsculas', () => {
    const cufe = generateCUFE('1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b')
    expect(cufe).toMatch(/^[0-9A-F]{96}$/)
  })

  it('la clave técnica participa en el hash (diferentes claves → diferentes CUFE)', () => {
    const args: [string, string, string, string, string, string, string, string, string, string, string] = [
      '900123456',
      'FACT-00000001',
      '2026-01-15T08:00:00-05:00',
      '2026-01-15',
      '100000.00',
      '19000.00',
      '100000.00',
      '119000.00',
      'SENA-POS-01',
      'abc123',
      '123456789-10',
    ]
    expect(generateCUFE(...args, 'CLV-A')).not.toBe(generateCUFE(...args, 'CLV-B'))
    expect(generateCUFE(...args, 'CLV-A')).not.toBe(generateCUFE(...args))
  })
})

// Misma URL que Factus retorna en bill.qr / links.qr: documentkey = CUFE.
describe('dianQrUrl', () => {
  const CUFE = '44E260A76E092E46FD5D8344A03146D5C8863AB68B18BDE38A53318A33BF6805BAC75F0BD71B0B75B3BD9C747A629470'

  it('sandbox (default) apunta al catálogo de habilitación', () => {
    expect(dianQrUrl(CUFE)).toBe(
      `https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=${CUFE}`
    )
    expect(dianQrUrl(CUFE, 'sandbox')).toBe(
      `https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=${CUFE}`
    )
  })

  it('production apunta al catálogo de producción', () => {
    expect(dianQrUrl(CUFE, 'production')).toBe(
      `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${CUFE}`
    )
  })

  it('valores desconocidos caen a sandbox', () => {
    expect(dianQrUrl(CUFE, undefined)).toContain('catalogo-vpfe-hab')
    expect(dianQrUrl(CUFE, 'otro')).toContain('catalogo-vpfe-hab')
  })
})
