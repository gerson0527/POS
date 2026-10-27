import { afterEach, describe, expect, it, vi } from 'vitest'
import { FactusProvider } from '@/lib/invoicing/factus'
import type { InvoicePayload, InvoiceProviderConfig } from '@/lib/invoicing/types'

const config: InvoiceProviderConfig = {
  providerId: 'factus-v2',
  baseUrl: 'https://factus.test',
  environment: 'sandbox',
  clientId: 'client',
  clientSecret: 'secret',
  username: 'user',
  password: 'pass',
  numberingRangeId: 1,
  sellerNit: '900123456',
  numberingPrefix: 'SETP',
}

const invoice: InvoicePayload = {
  numbering_range_id: 1,
  reference_code: 'FACT-sale_1',
  document: '01',
  operation_type: '10',
  payment_details: [{ payment_form: '1', payment_method_code: '10', amount: 119000 }],
  customer: {
    identification_document_code: '13',
    identification: '123456789',
    municipality_code: '11001',
    legal_organization_code: '2',
    tribute_code: 'ZZ',
    names: 'Jane',
    surnames: 'Doe',
    address: 'Calle 1',
    email: 'jane@example.com',
  },
  items: [
    {
      code_reference: 'SKU-1',
      name: 'Producto',
      quantity: 1,
      price: 100000,
      taxes: [{ code: '01', rate: '19.00', is_excluded: false }],
    },
  ],
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FactusProvider.sendInvoice', () => {
  it('ante 409 elimina la factura pendiente por referencia y reintenta una vez (F-02)', async () => {
    let validateCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/oauth/token')) {
        return json({ access_token: 'token-1', expires_in: 3600 })
      }
      if (url.includes('/v2/bills/destroy/reference/')) {
        return new Response(null, { status: 200 })
      }
      if (url.endsWith('/v2/bills/validate')) {
        validateCalls++
        if (validateCalls === 1) return json({ message: 'Factura pendiente' }, 409)
        return json({
          status: 'OK',
          data: {
            bill: {
              number: 'SETP990000001',
              reference_code: invoice.reference_code,
              cufe: 'CUFE-1',
              is_validated: true,
              qr: 'https://qr',
              public_url: 'https://pdf',
              xml_url: 'https://xml',
            },
          },
        })
      }
      throw new Error(`fetch inesperado: ${url} ${init?.method ?? ''}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = new FactusProvider(config)
    const result = await provider.sendInvoice(invoice)

    expect(result.success).toBe(true)
    expect(result.cufe).toBe('CUFE-1')
    expect(validateCalls).toBe(2)
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('/v2/bills/destroy/reference/FACT-sale_1')
      )
    ).toBe(true)
  })

  it('5xx es un resultado incierto y exige reconciliación (F-03)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/oauth/token')) {
        return json({ access_token: 'token-1', expires_in: 3600 })
      }
      if (url.endsWith('/v2/bills/validate')) {
        return json({ message: 'Servicio no disponible' }, 503)
      }
      throw new Error(`fetch inesperado: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await new FactusProvider(config).sendInvoice(invoice)

    expect(result.success).toBe(false)
    expect(result.uncertain).toBe(true)
    expect(result.needsReconciliation).toBe(true)
  })

  it('un 200 sin CUFE no se considera emitido', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/oauth/token')) {
        return json({ access_token: 'token-1', expires_in: 3600 })
      }
      if (url.endsWith('/v2/bills/validate')) {
        return json({ status: 'Created', data: { bill: { number: 42 } } })
      }
      throw new Error(`fetch inesperado: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await new FactusProvider(config).sendInvoice(invoice)

    expect(result.success).toBe(false)
    expect(result.cufe).toBeUndefined()
  })
})

describe('FactusProvider.lookupBillByReference', () => {
  it('recupera una factura ya emitida por reference_code (F-03)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/oauth/token')) {
        return json({ access_token: 'token-1', expires_in: 3600 })
      }
      if (url.includes('/v2/bills?filter[reference_code]=')) {
        return json({
          data: {
            data: [
              {
                reference_code: invoice.reference_code,
                cufe: 'CUFE-REMOTE',
                number: 'SETP990000009',
                is_validated: true,
                qr: 'https://qr',
                public_url: 'https://pdf',
                xml_url: 'https://xml',
              },
            ],
          },
        })
      }
      throw new Error(`fetch inesperado: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await new FactusProvider(config).lookupBillByReference(
      invoice.reference_code
    )

    expect(result?.success).toBe(true)
    expect(result?.cufe).toBe('CUFE-REMOTE')
    expect(result?.billNumber).toBe('SETP990000009')
  })

  it('devuelve null si la factura no existe en el proveedor', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/oauth/token')) {
        return json({ access_token: 'token-1', expires_in: 3600 })
      }
      if (url.includes('/v2/bills?filter[reference_code]=')) {
        return json({ data: { data: [] } })
      }
      throw new Error(`fetch inesperado: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await new FactusProvider(config).lookupBillByReference(
      invoice.reference_code
    )
    expect(result).toBeNull()
  })
})
