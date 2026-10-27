import { describe, expect, it } from 'vitest'
import {
  buildCustomerPayload,
  buildInvoiceReference,
  buildPayments,
  computeCashRoundingAmount,
  computeExactInvoiceTotal,
  splitNit,
  validateInvoiceContext,
} from '@/lib/invoicing/build-bill'

describe('splitNit', () => {
  it('separa NIT colombiano con DV', () => {
    expect(splitNit('9001234567')).toEqual({ nit: '900123456', dv: '7' })
    expect(splitNit('900.123.456-7')).toEqual({ nit: '900123456', dv: '7' })
    expect(splitNit('900123456-7')).toEqual({ nit: '900123456', dv: '7' })
  })

  it('9 dígitos o menos → sin DV', () => {
    expect(splitNit('123456789')).toEqual({ nit: '123456789', dv: '' })
    expect(splitNit('')).toEqual({ nit: '', dv: '' })
  })
})

describe('computeExactInvoiceTotal', () => {
  it('suma cantidad × precio + IVA por ítem', () => {
    const rows = [
      { item: { quantity: 2, unitPrice: 50000, ivaRate: 19 }, product: {} },
      { item: { quantity: 1, unitPrice: 10000, ivaRate: 5 }, product: {} },
    ]
    // 100000×1.19 = 119000 + 10000×1.05 = 10500 → 129500
    expect(computeExactInvoiceTotal(rows)).toBe(129500)
  })

  it('el IVA puede venir del producto cuando el ítem no lo trae', () => {
    const rows = [{ item: { quantity: 1, unitPrice: 1000 }, product: { ivaRate: 19 } }]
    expect(computeExactInvoiceTotal(rows)).toBe(1190)
  })

  it('ítems sin IVA (0) → subtotal exacto', () => {
    const rows = [{ item: { quantity: 3, unitPrice: 3333.33, ivaRate: 0 }, product: {} }]
    expect(computeExactInvoiceTotal(rows)).toBe(9999.99)
  })

  it('sin ítems → 0', () => {
    expect(computeExactInvoiceTotal([])).toBe(0)
  })
})

describe('computeCashRoundingAmount', () => {
  it('redondeo hacia arriba: POS 14.900 vs exacto 14.875 → +25', () => {
    expect(computeCashRoundingAmount(14875, 14900)).toBe(25)
  })

  it('redondeo hacia abajo: POS 14.900 vs exacto 14.925 → -25', () => {
    expect(computeCashRoundingAmount(14925, 14900)).toBe(-25)
  })

  it('total exacto → 0', () => {
    expect(computeCashRoundingAmount(119000, 119000)).toBe(0)
  })

  it('diferencia mayor a ±50 (descuento no reflejado) → 0', () => {
    expect(computeCashRoundingAmount(150000, 120000)).toBe(0)
  })
})

describe('buildInvoiceReference', () => {

  it('es estable para la misma venta (reintentos idempotentes)', () => {
    expect(buildInvoiceReference('sale_1792443185756')).toBe(
      buildInvoiceReference('sale_1792443185756')
    )
  })

  it('no colisiona entre ventas con el mismo ticket (Factus devolvería la factura existente)', () => {
    expect(buildInvoiceReference('sale_1')).not.toBe(buildInvoiceReference('sale_2'))
    expect(buildInvoiceReference('sale_1')).toBe('FACT-sale_1')
  })
})

describe('buildPayments', () => {
  it('sin pagos → efectivo por el total exacto', () => {
    expect(buildPayments([], 119000)).toEqual([
      { payment_form: '1', payment_method_code: '10', amount: '119000.00' },
    ])
  })

  it('un solo pago → el monto se fuerza al total exacto de la factura', () => {
    const details = buildPayments([{ method: 'CASH', amount: 120000, reference: null }], 119000)
    expect(details).toHaveLength(1)
    expect(details[0].amount).toBe('119000.00')
    expect(details[0].payment_method_code).toBe('10')
  })

  it('multi-pago → reconcilia la diferencia de redondeo en el efectivo', () => {
    const details = buildPayments(
      [
        { method: 'CASH', amount: 50000, reference: null },
        { method: 'TRANSFER', amount: 70000, reference: 'TRX-1' },
      ],
      119000
    )
    expect(details).toHaveLength(2)
    // suma original 120000 vs total 119000 → -1000 sobre el efectivo
    expect(Number(details[0].amount)).toBe(49000)
    expect(details[1].amount).toBe('70000.00')
    const sum = details.reduce((s, d) => s + Number(d.amount), 0)
    expect(sum).toBe(119000)
  })

  it('multi-pago sin efectivo → ajusta el primer pago', () => {
    const details = buildPayments(
      [
        { method: 'NEQUI', amount: 60000, reference: 'N1' },
        { method: 'TRANSFER', amount: 60000, reference: 'T1' },
      ],
      119000
    )
    expect(details[0].amount).toBe('59000.00')
    expect(details[1].amount).toBe('60000.00')
  })
})

describe('validateInvoiceContext', () => {
  const base = {
    sale: {
      status: 'COMPLETED',
      customerDocNumber: null,
      customerName: null,
      customerEmail: null,
      customerAddress: null,
    },
    itemsRows: [
      { item: { quantity: 1, unitPrice: 10000, ivaRate: 19 }, product: {} },
    ],
    paymentsRows: [{ method: 'CASH', amount: 11900 }],
    customerRow: null,
    ctx: {
      tenant: {
        id: 'tenant_1',
        nit: '900123456',
        numberingRangeId: 1,
        numberingPrefix: 'FACT',
        municipalityCode: '11001',
        tributeCode: 'ZZ',
      },
    },
  }

  it('acepta una venta completada con consumidor final', () => {
    expect(validateInvoiceContext(base)).toEqual([])
  })

  it('rechaza ventas que no están COMPLETED (F-05)', () => {
    const errors = validateInvoiceContext({
      ...base,
      sale: { ...base.sale, status: 'DRAFT' },
    })
    expect(errors.join(' ')).toContain('COMPLETADA')
  })

  it('exige rango de numeración y datos mínimos del cliente identificado (F-11)', () => {
    const errors = validateInvoiceContext({
      ...base,
      sale: { ...base.sale, customerDocNumber: '123' },
      customerRow: { documentNumber: '123', name: 'Cliente', municipalityCode: '11001' },
      ctx: { tenant: { ...base.ctx.tenant, numberingRangeId: 0 } },
    })
    expect(errors.join(' ')).toContain('rango de numeración')
    expect(errors.join(' ')).toContain('email')
    expect(errors.join(' ')).toContain('dirección')
  })
})

describe('buildCustomerPayload', () => {
  const base = {
    documentType: 'CC',
    documentNumber: '1020304050',
    personType: 'NATURAL',
    name: 'Jane Marie Doe',
    email: 'jane@example.com',
    phone: '3001112233',
    address: 'Carrera 7 # 34-56',
  }

  it('persona natural: names/surnames separados y CC → 13', () => {
    const c = buildCustomerPayload(base, '11001', 'ZZ')
    expect(c.identification_document_code).toBe('13')
    expect(c.identification).toBe('1020304050')
    expect(c.names).toBe('Jane')
    expect(c.surnames).toBe('Marie Doe')
    expect(c.company).toBeUndefined()
    expect(c.legal_organization_code).toBe('2')
    expect(c.tribute_code).toBe('ZZ')
    expect(c.municipality_code).toBe('11001')
  })

  it('empresa NIT: company en vez de names y DV separado', () => {
    const c = buildCustomerPayload(
      {
        ...base,
        identificationDocumentCode: '31',
        documentNumber: '9001234567',
        personType: 'JURIDICA',
        name: 'MI EMPRESA SAS',
      },
      '05001',
      'ZZ'
    )
    expect(c.identification).toBe('900123456')
    expect(c.dv).toBe('7')
    expect(c.company).toBe('MI EMPRESA SAS')
    expect(c.names).toBeUndefined()
    expect(c.legal_organization_code).toBe('1')
    expect(c.municipality_code).toBe('05001')
  })

  it('defaults: dirección y email de respaldo', () => {
    const c = buildCustomerPayload(
      { ...base, address: null, email: null },
      '11001',
      'ZZ'
    )
    expect(c.address).toBe('Sin dirección registrada')
    expect(c.email).toBe('no-email@posretail.local')
  })
})
