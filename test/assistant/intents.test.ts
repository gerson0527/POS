import { describe, expect, it } from 'vitest'
import { assistantIntentSchema } from '@/lib/assistant/intents'
import { buildSummary } from '@/lib/assistant/summary'
import type { ResolvedIntent } from '@/lib/assistant/resolve'
import { verifyTelegramSecret } from '@/lib/channels/telegram'

describe('assistantIntentSchema', () => {
  it('acepta CREATE_SALE y default de pago CASH', () => {
    const parsed = assistantIntentSchema.parse({
      type: 'CREATE_SALE',
      items: [{ query: 'coca 2L', quantity: 2 }],
      customer: { documentNumber: '123' },
    })
    expect(parsed.type).toBe('CREATE_SALE')
    if (parsed.type === 'CREATE_SALE') {
      expect(parsed.paymentMethod).toBe('CASH')
    }
  })

  it('acepta ajuste con cantidad negativa', () => {
    const parsed = assistantIntentSchema.parse({
      type: 'INVENTORY_ADJUSTMENT',
      items: [{ query: 'arroz', quantity: -2 }],
      reason: 'merma',
    })
    expect(parsed.type).toBe('INVENTORY_ADJUSTMENT')
  })

  it('rechaza JSON inválido', () => {
    expect(() =>
      assistantIntentSchema.parse({ type: 'CREATE_SALE', items: [] })
    ).toThrow()
  })
})

describe('buildSummary', () => {
  it('bloquea factura sin turno de caja', () => {
    const resolved: ResolvedIntent = {
      intent: {
        type: 'CREATE_SALE',
        items: [{ query: 'pan', quantity: 1 }],
        paymentMethod: 'CASH',
      },
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
      openCashSession: null,
      blockers: [
        'No hay un turno de caja abierto para hoy. Abra caja en el POS antes de facturar por el bot.',
      ],
      notices: [],
    }
    const text = buildSummary(resolved)
    expect(text).toContain('turno de caja abierto')
    expect(text).not.toMatch(/Borrador de factura/)
  })

  it('muestra borrador con consumidor final cuando no hay blockers', () => {
    const resolved: ResolvedIntent = {
      intent: {
        type: 'CREATE_SALE',
        items: [{ query: 'pan', quantity: 1 }],
        paymentMethod: 'CASH',
      },
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
    expect(buildSummary(resolved)).toMatch(/Borrador de factura/)
    expect(buildSummary(resolved)).toMatch(/CONSUMIDOR FINAL/)
  })
})

describe('verifyTelegramSecret', () => {
  it('acepta si no hay secreto configurado (polling local)', () => {
    expect(verifyTelegramSecret(null, '')).toBe(true)
  })

  it('exige coincidencia cuando hay secreto', () => {
    expect(verifyTelegramSecret('abc', 'abc')).toBe(true)
    expect(verifyTelegramSecret('wrong', 'abc')).toBe(false)
    expect(verifyTelegramSecret(null, 'abc')).toBe(false)
  })
})

describe('telegram deep link', () => {
  it('arma t.me/Bot?start=CODIGO', async () => {
    const { buildTelegramStartLink } = await import('@/lib/assistant/telegram-deep-link')
    expect(buildTelegramStartLink('MiBotPOS', '1B232A6B')).toBe(
      'https://t.me/MiBotPOS?start=1B232A6B'
    )
  })
})
