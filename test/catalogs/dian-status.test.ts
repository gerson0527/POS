import { describe, expect, it } from 'vitest'
import {
  FISCAL_DOCUMENT_STATUSES,
  mapFiscalStatus,
} from '@/lib/catalogs/dian-status'

describe('FISCAL_DOCUMENT_STATUSES', () => {
  it('contiene los 11 estados del enum fiscal', () => {
    expect(FISCAL_DOCUMENT_STATUSES).toHaveLength(11)
    expect(FISCAL_DOCUMENT_STATUSES).toContain('ACCEPTED')
    expect(FISCAL_DOCUMENT_STATUSES).toContain('REJECTED')
    expect(FISCAL_DOCUMENT_STATUSES).toContain('PENDING_GENERATION')
  })
})

describe('mapFiscalStatus', () => {
  it('estados exactos del enum pasan sin cambios', () => {
    for (const s of FISCAL_DOCUMENT_STATUSES) {
      expect(mapFiscalStatus(s)).toBe(s)
    }
  })

  it('es case-insensitive sobre estados válidos', () => {
    expect(mapFiscalStatus('accepted')).toBe('ACCEPTED')
    expect(mapFiscalStatus('  Queued  ')).toBe('QUEUED')
  })

  it('normaliza rechazos (REJECT/RECHAZ)', () => {
    expect(mapFiscalStatus('REJECTED_BY_DIAND')).toBe('REJECTED')
    expect(mapFiscalStatus('RECHAZADO')).toBe('REJECTED')
    expect(mapFiscalStatus('REJECT')).toBe('REJECTED')
  })

  it('normaliza pendientes y colas', () => {
    expect(mapFiscalStatus('PENDIENTE')).toBe('SUBMITTED')
    expect(mapFiscalStatus('EN COLA')).toBe('QUEUED')
    expect(mapFiscalStatus('QUEUE')).toBe('QUEUED')
  })

  it('valores desconocidos o vacíos → ACCEPTED', () => {
    expect(mapFiscalStatus('COSA_RARA')).toBe('ACCEPTED')
    expect(mapFiscalStatus('')).toBe('ACCEPTED')
    expect(mapFiscalStatus(undefined)).toBe('ACCEPTED')
    expect(mapFiscalStatus(null as any)).toBe('ACCEPTED')
  })
})
