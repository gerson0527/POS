import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { INTERNAL_NUMERATION } from '@/lib/fiscal/numeration'
import { generateInvoice } from '@/app/actions/sales'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  numerationWhere: vi.fn(),
  reserve: vi.fn(),
  insertDocument: vi.fn(),
  logAudit: vi.fn(),
  publishEvent: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    transaction: mocks.transaction,
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/app/actions/_shared', () => ({
  getUserId: vi.fn(async () => 'user-1'),
  getTenantId: vi.fn(async () => 'tenant-1'),
  requireRole: vi.fn(),
  requireActor: vi.fn(),
  logAudit: mocks.logAudit,
  publishEvent: mocks.publishEvent,
}))
vi.mock('@/lib/sales/service', () => ({
  SALE_ROLES: ['ADMIN', 'MANAGER', 'CASHIER'],
  createSale: vi.fn(),
  completeSale: vi.fn(),
}))

const dialect = new PgDialect()
const input = { saleId: 'sale-1', resolution: INTERNAL_NUMERATION.resolution, prefix: 'REC' }
let numeration: typeof schema.numeration.$inferInsert | undefined
let documents: (typeof schema.fiscalDocument.$inferInsert)[]

function document(overrides: Partial<typeof schema.fiscalDocument.$inferInsert> = {}) {
  return {
    id: 'internal-1',
    tenantId: 'tenant-1',
    saleId: 'sale-1',
    documentType: INTERNAL_NUMERATION.documentType,
    prefix: 'SETT',
    fullNumber: 'SETT00000001',
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  numeration = {
    ...INTERNAL_NUMERATION,
    id: 'num-internal',
    tenantId: 'tenant-1',
    prefix: 'SETT',
    currentNumber: 0,
    status: 'ACTIVE',
  }
  documents = []

  mocks.numerationWhere.mockImplementation(() => ({
    limit: async () => numeration ? [numeration] : [],
  }))
  mocks.select.mockImplementation(() => ({
    from: (table: unknown) => ({
      where: table === schema.numeration
        ? mocks.numerationWhere
        : () => table === schema.sale
          ? { limit: async () => [{ id: 'sale-1', status: 'COMPLETED' }] }
          : Promise.resolve([...documents]),
    }),
  }))
  mocks.insert.mockImplementation(() => ({
    values: (values: typeof schema.numeration.$inferInsert) => ({
      onConflictDoNothing: async () => { numeration = values },
    }),
  }))
  mocks.update.mockImplementation(() => ({
    set: (values: Partial<typeof schema.numeration.$inferInsert>) => ({
      where: () => ({
        returning: async () => {
          numeration = { ...numeration!, ...values }
          return [numeration]
        },
      }),
    }),
  }))
  mocks.reserve.mockImplementation(async () => {
    numeration!.currentNumber = Number(numeration!.currentNumber) + 1
    return [{ currentNumber: String(numeration!.currentNumber) }]
  })
  mocks.insertDocument.mockImplementation(async (values: typeof schema.fiscalDocument.$inferInsert) => {
    documents.push(values)
  })
  mocks.transaction.mockImplementation(async (callback) => callback({
    update: () => ({
      set: () => ({ where: () => ({ returning: mocks.reserve }) }),
    }),
    insert: () => ({ values: mocks.insertDocument }),
  }))
})

describe('generateInvoice con numeración interna configurable', () => {
  it('reutiliza SETT por tenant y resolución sin recrear REC, y no duplica al repetir', async () => {
    const first = await generateInvoice(input)
    const repeated = await generateInvoice(input)

    expect(first).toMatchObject({ invoiceNumber: 'SETT00000001', success: true })
    expect(repeated).toEqual(first)
    expect(documents).toHaveLength(1)
    expect(documents[0]).toMatchObject({ prefix: 'SETT', consecutive: '1' })
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.reserve).toHaveBeenCalledTimes(1)
    expect(mocks.insertDocument).toHaveBeenCalledTimes(1)
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.logAudit).toHaveBeenCalledTimes(1)
    expect(mocks.publishEvent).toHaveBeenCalledTimes(1)
    for (const [condition] of mocks.numerationWhere.mock.calls) {
      const query = dialect.sqlToQuery(condition as SQL)
      expect(query.params).toEqual(['tenant-1', INTERNAL_NUMERATION.resolution])
      expect(query.sql).not.toContain('"prefix"')
    }
  })

  it('reutiliza un comprobante REC legacy aunque el prefijo configurado sea SETT', async () => {
    documents.push(document({ prefix: 'REC', fullNumber: 'REC00000001' }))

    await expect(generateInvoice(input)).resolves.toEqual({
      invoiceId: 'internal-1', invoiceNumber: 'REC00000001', success: true,
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it.each(['SETT', 'REC'])('no confunde una factura electrónica sin CUFE con el comprobante %s', async (prefix) => {
    const electronic = document({
      id: 'electronic-1', documentType: 'FACTURA_ELECTRONICA_VENTA', prefix,
    })
    documents.push(electronic)

    const result = await generateInvoice(input)

    expect(result.invoiceId).not.toBe(electronic.id)
    expect(documents).toHaveLength(2)
    expect(documents[0]).toEqual(electronic)
    expect(mocks.insertDocument).toHaveBeenCalledTimes(1)
  })

  it('devuelve el documento con CUFE sin buscar ni consumir numeración interna', async () => {
    documents.push(document({
      id: 'electronic-1', documentType: 'FACTURA_ELECTRONICA_VENTA', uniqueCode: 'cufe-1',
    }))

    await expect(generateInvoice(input)).resolves.toEqual({
      invoiceId: 'electronic-1', invoiceNumber: 'SETT00000001', cufe: 'cufe-1', success: true,
    })
    expect(mocks.numerationWhere).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('repara tipo y estado sin perder el prefijo personalizado', async () => {
    numeration!.status = 'INACTIVE'
    numeration!.documentType = 'FACTURA_ELECTRONICA_VENTA'

    await expect(generateInvoice(input)).resolves.toMatchObject({
      invoiceNumber: 'SETT00000001',
    })
    expect(numeration).toMatchObject({
      prefix: 'SETT', status: 'ACTIVE', documentType: INTERNAL_NUMERATION.documentType,
    })
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('crea REC como valor por defecto solo cuando no hay numeración interna', async () => {
    numeration = undefined

    await expect(generateInvoice(input)).resolves.toMatchObject({
      invoiceNumber: 'REC00000001',
    })
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith(schema.numeration)
    expect(numeration).toMatchObject({
      tenantId: 'tenant-1', resolution: INTERNAL_NUMERATION.resolution, prefix: 'REC',
    })
  })
})
