import { describe, expect, it } from 'vitest'
import { canHandleIntent, permissionDeniedMessage } from '@/lib/assistant/permissions'
import { buildSummary, buildDraftOptions } from '@/lib/assistant/summary'
import { recomputeBlockers, type ResolvedIntent } from '@/lib/assistant/resolve'
import { verifyTelegramSecret } from '@/lib/channels/telegram'

describe('canHandleIntent', () => {
  it('CASHIER puede facturar y consultar, no inventario', () => {
    expect(canHandleIntent('CASHIER', { type: 'CREATE_SALE', items: [{ query: 'x', quantity: 1 }], paymentMethod: 'CASH' })).toBe(true)
    expect(canHandleIntent('CASHIER', { type: 'STOCK_QUERY', query: 'x' })).toBe(true)
    expect(canHandleIntent('CASHIER', { type: 'INVENTORY_IN', items: [{ query: 'x', quantity: 1 }] })).toBe(false)
  })

  it('MANAGER puede inventario', () => {
    expect(canHandleIntent('MANAGER', { type: 'INVENTORY_OUT', items: [{ query: 'x', quantity: 2 }] })).toBe(true)
  })

  it('mensaje de denegación incluye rol', () => {
    expect(permissionDeniedMessage('INVENTORY_IN', 'CASHIER')).toContain('CASHIER')
  })
})

describe('buildDraftOptions callback size', () => {
  it('callback_data de confirmación cabe en 64 bytes', () => {
    const draftId = 'd_' + 'a'.repeat(16)
    const resolved: ResolvedIntent = {
      intent: { type: 'CREATE_SALE', items: [{ query: 'pan', quantity: 1 }], paymentMethod: 'CASH' },
      products: [
        {
          query: 'pan',
          quantity: 1,
          status: 'matched',
          product: {
            id: 'p1',
            name: 'Pan',
            sku: 'PAN',
            unitPrice: '1000',
            ivaRate: '0',
            taxTreatment: 'TAXED',
          },
        },
      ],
      customer: { status: 'final_consumer' },
      openCashSession: {
        id: 'cs1',
        locationId: 'loc1',
        locationName: 'Centro',
        businessDate: '2026-04-28',
      },
      blockers: [],
      notices: [],
    }
    const opts = buildDraftOptions(draftId, resolved)!
    expect(opts.some((o) => o.data.startsWith('confirm:'))).toBe(true)
    for (const opt of opts) {
      expect(Buffer.byteLength(opt.data, 'utf8')).toBeLessThanOrEqual(64)
    }
  })

  it('sin cliente ofrece Consumidor final', () => {
    const draftId = 'd_abcdef0123456789'
    const resolved: ResolvedIntent = {
      intent: { type: 'CREATE_SALE', items: [{ query: 'pan', quantity: 1 }], paymentMethod: 'CASH' },
      products: [
        {
          query: 'pan',
          quantity: 1,
          status: 'matched',
          product: {
            id: 'p1',
            name: 'Pan',
            sku: 'PAN',
            unitPrice: '1000',
            ivaRate: '0',
            taxTreatment: 'TAXED',
          },
        },
      ],
      customer: { status: 'none' },
      openCashSession: {
        id: 'cs1',
        locationId: 'loc1',
        locationName: 'Centro',
        businessDate: '2026-04-28',
      },
      blockers: ['Indique el cliente'],
      notices: [],
    }
    const opts = buildDraftOptions(draftId, resolved)!
    expect(opts[0].data).toMatch(/^cf:/)
  })

  it('opciones de ambigüedad usan índices cortos', () => {
    const draftId = 'd_abcdef0123456789'
    const resolved: ResolvedIntent = {
      intent: { type: 'CREATE_SALE', items: [{ query: 'coca', quantity: 1 }], paymentMethod: 'CASH' },
      products: [
        {
          query: 'coca',
          quantity: 1,
          status: 'ambiguous',
          candidates: [
            { id: 'prod_very_long_id_1', name: 'Coca 1.5L', sku: 'C1', score: 0.9 },
            { id: 'prod_very_long_id_2', name: 'Coca 2L', sku: 'C2', score: 0.85 },
          ],
        },
      ],
      customer: { status: 'none' },
      openCashSession: null,
      blockers: ['ambiguo'],
      notices: [],
    }
    const opts = buildDraftOptions(draftId, resolved)!
    expect(opts[0].data).toMatch(/^pp:/)
    for (const opt of opts) {
      expect(Buffer.byteLength(opt.data, 'utf8')).toBeLessThanOrEqual(64)
    }
  })
})

describe('recomputeBlockers + summary venta', () => {
  it('exige caja abierta para factura', () => {
    const base: ResolvedIntent = {
      intent: { type: 'CREATE_SALE', items: [{ query: 'pan', quantity: 1 }], paymentMethod: 'CASH' },
      products: [
        {
          query: 'pan',
          quantity: 1,
          status: 'matched',
          product: {
            id: 'p1',
            name: 'Pan',
            sku: 'PAN',
            unitPrice: '1000',
            ivaRate: '0',
            taxTreatment: 'TAXED',
          },
        },
      ],
      customer: { status: 'final_consumer' },
      openCashSession: null,
      blockers: [],
      notices: [],
    }
    const withBlockers = recomputeBlockers(base)
    expect(withBlockers.blockers.some((b) => b.includes('turno de caja'))).toBe(true)
    expect(buildSummary(withBlockers)).toContain('turno de caja')
  })

  it('muestra stock por sede', () => {
    const resolved: ResolvedIntent = {
      intent: { type: 'STOCK_QUERY', query: 'arroz' },
      products: [
        {
          query: 'arroz',
          quantity: 1,
          status: 'matched',
          product: {
            id: 'p1',
            name: 'Arroz',
            sku: 'ARZ',
            unitPrice: '2000',
            ivaRate: '0',
            taxTreatment: 'TAXED',
          },
        },
      ],
      customer: { status: 'none' },
      openCashSession: null,
      blockers: [],
      notices: [],
      stockLevels: [{ locationId: 'l1', locationName: 'Centro', quantity: 12, available: 12 }],
    }
    expect(buildSummary(resolved)).toContain('Centro')
    expect(buildSummary(resolved)).toContain('12')
  })
})

describe('telegram secret', () => {
  it('valida secreto', () => {
    expect(verifyTelegramSecret('x', 'x')).toBe(true)
    expect(verifyTelegramSecret(null, 'x')).toBe(false)
  })
})
