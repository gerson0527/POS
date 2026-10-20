import { describe, expect, it } from 'vitest'
import {
  buildFactusFailureMessage,
  extractBill,
  getFactusDianStatus,
  mapDocumentType,
  mapPaymentMethod,
  mapTax,
  parseFactusBody,
  toFactusPayload,
  toInvoiceResult,
  toMoneyString,
  toPaymentDetail,
} from '@/lib/invoicing/factus-mappers'
import type { InvoicePayload } from '@/lib/invoicing/types'

describe('mapPaymentMethod', () => {
  it('mapea métodos POS a códigos DIAN de Factus', () => {
    expect(mapPaymentMethod('CASH')).toBe('10')
    expect(mapPaymentMethod('EFECTIVO')).toBe('10')
    expect(mapPaymentMethod('CARD')).toBe('48')
    expect(mapPaymentMethod('CREDIT_CARD')).toBe('48')
    expect(mapPaymentMethod('DEBIT_CARD')).toBe('49')
    expect(mapPaymentMethod('TRANSFER')).toBe('42')
    expect(mapPaymentMethod('NEQUI')).toBe('47')
    expect(mapPaymentMethod('QR')).toBe('47')
    expect(mapPaymentMethod('BONOS')).toBe('71')
  })

  it('es case-insensitive y defaultea a efectivo (10)', () => {
    expect(mapPaymentMethod('cash')).toBe('10')
    expect(mapPaymentMethod('  nequi  ')).toBe('47')
    expect(mapPaymentMethod('')).toBe('10')
    expect(mapPaymentMethod('METODO_DESCONOCIDO')).toBe('10')
  })
})

describe('mapDocumentType', () => {
  it('mapea tipos de documento a códigos DIAN', () => {
    expect(mapDocumentType('CC')).toBe('13')
    expect(mapDocumentType('TI')).toBe('12')
    expect(mapDocumentType('CE')).toBe('22')
    expect(mapDocumentType('PAS')).toBe('41')
    expect(mapDocumentType('PASAPORTE')).toBe('41')
    expect(mapDocumentType('NIT')).toBe('31')
    expect(mapDocumentType('RC')).toBe('11')
  })

  it('defaultea a CC (13)', () => {
    expect(mapDocumentType('')).toBe('13')
    expect(mapDocumentType('XYZ')).toBe('13')
  })
})

describe('mapTax', () => {
  it('convierte tasas a (code, rate, excluded)', () => {
    expect(mapTax(19)).toEqual({ code: '01', rate: '19.00', is_excluded: false })
    expect(mapTax(5)).toEqual({ code: '01', rate: '5.00', is_excluded: false })
    expect(mapTax('8')).toEqual({ code: '01', rate: '8.00', is_excluded: false })
  })

  it('tasa 0 o vacía queda excluida', () => {
    expect(mapTax(0)).toEqual({ code: '01', rate: '0.00', is_excluded: true })
    expect(mapTax('')).toEqual({ code: '01', rate: '0.00', is_excluded: true })
  })
})

describe('toMoneyString', () => {
  it('normaliza a 2 decimales (estándar DIAN)', () => {
    expect(toMoneyString(10)).toBe('10.00')
    expect(toMoneyString('3.1416')).toBe('3.14')
    expect(toMoneyString(119000)).toBe('119000.00')
  })

  it('valores invacados o no numéricos → 0.00', () => {
    expect(toMoneyString(null)).toBe('0.00')
    expect(toMoneyString(undefined)).toBe('0.00')
    expect(toMoneyString('abc')).toBe('0.00')
  })
})

describe('toPaymentDetail', () => {
  it('construye el detalle de pago con código Factus', () => {
    expect(toPaymentDetail('CASH', 250.5, 'REF-1')).toEqual({
      payment_form: '1',
      payment_method_code: '10',
      reference_code: 'REF-1',
      amount: '250.50',
    })
    expect(toPaymentDetail('DEBIT_CARD', 1000).payment_method_code).toBe('49')
  })

  it('marca las ventas a crédito como pago a plazo', () => {
    const result = toPaymentDetail('STORE_CREDIT', 1000, 'CREDITO')
    expect(result.payment_form).toBe('2')
    expect(result.payment_method_code).toBe('10')
    expect(result.due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('toFactusPayload', () => {
  const invoice = {
    numbering_range_id: 7,
    reference_code: 'FACT-00000001',
    document: '01',
    operation_type: '10',
    send_email: false,
    observation: 'Prueba',
    payment_details: [{ payment_form: '1', payment_method_code: '10', amount: 119000 }],
    customer: {
      identification_document_code: '13',
      identification: '123456789',
      municipality_code: '11001',
      legal_organization_code: '2',
      tribute_code: 'ZZ',
      names: 'JANE',
      surnames: 'DOE',
      address: 'Calle 1 # 2-3',
      email: 'jane@example.com',
    },
    items: [
      {
        code_reference: 'SKU-1',
        name: 'Producto',
        quantity: 2,
        price: 50000,
        discount_rate: 0,
        unit_measure_code: '94',
        standard_code: '999',
        scheme_id: '0',
        taxes: [{ code: '01', rate: '19.00', is_excluded: false }],
      },
    ],
  } as InvoicePayload

  it('serializa números a strings de 2 decimales y agrega cash_rounding_amount', () => {
    const payload = toFactusPayload(invoice)
    expect(payload.cash_rounding_amount).toBe('0.00')
    expect(payload.payment_details[0].amount).toBe('119000.00')
    expect(payload.items[0].quantity).toBe('2.00')
    expect(payload.items[0].price).toBe('50000.00')
    expect(payload.items[0].discount_rate).toBe('0.00')
    expect(payload.items[0].taxes[0].rate).toBe('19.00')
    expect(payload.customer.identification).toBe('123456789')
  })

  it('envía el ajuste de redondeo de caja cuando viene en el payload', () => {
    const payload = toFactusPayload({ ...invoice, cash_rounding_amount: 25 } as InvoicePayload)
    expect(payload.cash_rounding_amount).toBe('25.00')
  })

  it('defaults de ítem: unit_measure 94 y standard 999', () => {
    const payload = toFactusPayload({
      ...invoice,
      items: [{ code_reference: 'X', name: 'X', quantity: 1, price: 100, taxes: [] }],
    } as InvoicePayload)
    expect(payload.items[0].unit_measure_code).toBe('94')
    expect(payload.items[0].standard_code).toBe('999')
  })
})

describe('parseFactusBody / extractBill / getFactusDianStatus', () => {
  it('parsea JSON válido, vacío e inválido sin lanzar', () => {
    expect(parseFactusBody('{"status":"ok"}')).toEqual({ status: 'ok' })
    expect(parseFactusBody('')).toEqual({})
    expect(parseFactusBody('<html>error</html>')).toEqual({})
  })

  it('extrae data.bill o data directo', () => {
    expect(extractBill({ data: { bill: { id: 1 } } })).toEqual({ id: 1 })
    expect(extractBill({ data: { id: 2 } as any })).toEqual({ id: 2 })
    expect(extractBill({})).toBeUndefined()
  })

  it('prioriza bill.status explícito sobre status raíz', () => {
    expect(getFactusDianStatus({ status: 'ROOT' }, { status: 'ACCEPTED' })).toBe('ACCEPTED')
    expect(getFactusDianStatus({ status: 'ROOT' }, { status: 'REJECTED' })).toBe('REJECTED')
    expect(getFactusDianStatus({}, undefined)).toBeUndefined()
  })

  it('usa is_validated=true como ACCEPTED (Factus V2)', () => {
    expect(
      getFactusDianStatus(
        { status: 'Created' },
        { is_validated: true, validated_at: '20-10-2026 01:05:01 PM', cufe: 'C' }
      )
    ).toBe('ACCEPTED')
  })

  it('no confunde el status raíz "OK"/"Created" con estado DIAN', () => {
    expect(getFactusDianStatus({ status: 'OK' }, { cufe: 'C' })).toBeUndefined()
    expect(getFactusDianStatus({ status: 'Created' }, {})).toBeUndefined()
  })

  it('is_validated=false es REJECTED solo si errors contiene rechazo; si no, SUBMITTED', () => {
    expect(
      getFactusDianStatus(
        { status: 'OK' },
        { is_validated: false, errors: { FAJ44b: 'Documento rechazado por la DIAN' } }
      )
    ).toBe('REJECTED')
    expect(
      getFactusDianStatus(
        { status: 'OK' },
        { is_validated: false, errors: { RUT01: 'Notificación informativa' } }
      )
    ).toBe('SUBMITTED')
    expect(getFactusDianStatus({ status: 'OK' }, { is_validated: false })).toBe('SUBMITTED')
  })

  it('acepta status raíz solo si es un estado DIAN explícito', () => {
    expect(getFactusDianStatus({ status: 'REJECTED' }, undefined)).toBe('REJECTED')
    expect(getFactusDianStatus({ status: 'PENDING' }, undefined)).toBe('PENDING')
  })
})

describe('buildFactusFailureMessage', () => {
  it('usa message raíz cuando no hay errors', () => {
    expect(buildFactusFailureMessage(422, { message: 'Rechazado' })).toBe('Rechazado')
  })

  it('defaultea al status cuando no hay message', () => {
    expect(buildFactusFailureMessage(500, {})).toBe('Factus V2 respondió con status 500')
  })

  it('despliega errors como objeto {campo: [msgs]}', () => {
    const msg = buildFactusFailureMessage(422, {
      message: 'Validación',
      errors: { total: ['No cuadra'], 'customer.email': ['Requerido'] },
    } as any)
    expect(msg).toContain('Validación')
    expect(msg).toContain('  • total: No cuadra')
    expect(msg).toContain('  • customer.email: Requerido')
  })

  it('despliega errors como array', () => {
    const msg = buildFactusFailureMessage(422, {
      errors: [{ message: 'Campo inválido' }],
    } as any)
    expect(msg).toContain('  • Campo inválido')
  })
})

describe('toInvoiceResult', () => {
  const base = {
    invoice: { reference_code: 'FACT-9' } as InvoicePayload,
    json: { message: 'OK DIAN' },
    bill: { cufe: 'CUFE123', number: 42 },
    links: { qrCodeUrl: 'qr', pdfUrl: 'pdf', xmlUrl: 'xml' },
    providerId: 'factus-v2',
  }

  it('arma el resultado de éxito completo', () => {
    const r = toInvoiceResult({ ...base, dianStatus: 'ACCEPTED' })
    expect(r.success).toBe(true)
    expect(r.cufe).toBe('CUFE123')
    expect(r.billNumber).toBe(42)
    expect(r.dianStatus).toBe('ACCEPTED')
    expect(r.message).toBe('OK DIAN')
    expect(r.qrCodeUrl).toBe('qr')
    expect(r.providerId).toBe('factus-v2')
  })

  it('defaultea dianStatus a SUBMITTED (nunca ACCEPTED) y billNumber al reference_code', () => {
    const r = toInvoiceResult({
      ...base,
      json: {},
      bill: { cufe: 'C' },
      links: {},
    })
    expect(r.dianStatus).toBe('SUBMITTED')
    expect(r.billNumber).toBe('FACT-9')
    expect(r.message).toBe(
      'Factura FACT-9 emitida vía Factus V2; estado DIAN: SUBMITTED.'
    )
  })
})
