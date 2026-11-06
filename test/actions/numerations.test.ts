import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { AppError } from '@/lib/errors'
import { AuditAction } from '@/lib/types'
import { INTERNAL_NUMERATION, type NumerationInput } from '@/lib/fiscal/numeration'
import { createNumeration, deleteNumeration, updateNumeration } from '@/app/actions/numerations'

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  getTenantId: vi.fn(),
  requireRole: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  selectWhere: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  updateWhere: vi.fn(),
  delete: vi.fn(),
  deleteWhere: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.delete,
  },
}))
vi.mock('@/app/actions/_shared', () => ({
  getUserId: mocks.getUserId,
  getTenantId: mocks.getTenantId,
  requireRole: mocks.requireRole,
  logAudit: mocks.logAudit,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

const dialect = new PgDialect()
const id = 'num-internal'
const internal = {
  ...INTERNAL_NUMERATION,
  id,
  tenantId: 'tenant-1',
  currentNumber: 0,
  status: 'ACTIVE',
}
const external: NumerationInput = {
  resolution: 'DIAN-123',
  prefix: 'FE',
  startRange: 1,
  endRange: 100,
  currentNumber: 0,
  documentType: 'FACTURA_ELECTRONICA_VENTA',
  status: 'ACTIVE',
}

function selectResults(...results: unknown[][]) {
  for (const rows of results) mocks.limit.mockResolvedValueOnce(rows)
}

function expectSelectTables(...tables: unknown[]) {
  expect(mocks.select).toHaveBeenCalledTimes(tables.length)
  expect(mocks.from.mock.calls).toEqual(tables.map((table) => [table]))
  expect(mocks.limit.mock.calls).toEqual(tables.map(() => [1]))
}

function expectNoMutation() {
  expect(mocks.insert).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
  expect(mocks.delete).not.toHaveBeenCalled()
  expect(mocks.logAudit).not.toHaveBeenCalled()
  expect(mocks.revalidatePath).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.getUserId.mockResolvedValue('user-1')
  mocks.getTenantId.mockResolvedValue('tenant-1')
  mocks.requireRole.mockResolvedValue(undefined)
  mocks.logAudit.mockResolvedValue(undefined)
  mocks.select.mockReturnValue({ from: mocks.from })
  mocks.from.mockReturnValue({ where: mocks.selectWhere })
  mocks.selectWhere.mockReturnValue({ limit: mocks.limit })
  mocks.limit.mockRejectedValue(new Error('Consulta SELECT inesperada en el test'))
  mocks.insert.mockReturnValue({ values: mocks.values })
  mocks.values.mockResolvedValue(undefined)
  mocks.update.mockReturnValue({ set: mocks.set })
  mocks.set.mockReturnValue({ where: mocks.updateWhere })
  mocks.updateWhere.mockResolvedValue(undefined)
  mocks.delete.mockReturnValue({ where: mocks.deleteWhere })
  mocks.deleteWhere.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('updateNumeration', () => {
  it('permite REC → SETT sin emisiones, audita y revalida sin consultar duplicados activos', async () => {
    selectResults([internal], [], [])

    await expect(updateNumeration(id, { prefix: ' sett ' })).resolves.toEqual({ success: true })

    expectSelectTables(schema.numeration, schema.fiscalDocument, schema.numeration)
    expect(mocks.select.mock.calls).toEqual([
      [], [{ id: schema.fiscalDocument.id }], [{ id: schema.numeration.id }],
    ])
    expect(dialect.sqlToQuery(mocks.selectWhere.mock.calls[0][0] as SQL).params)
      .toEqual([id, 'tenant-1'])
    const documentsQuery = dialect.sqlToQuery(mocks.selectWhere.mock.calls[1][0] as SQL)
    expect(documentsQuery.params).toEqual(['tenant-1', internal.documentType, 'REC'])
    const overlapQuery = dialect.sqlToQuery(mocks.selectWhere.mock.calls[2][0] as SQL)
    expect(overlapQuery.params).toEqual(['tenant-1', 'SETT', internal.endRange, 1, id])
    expect(overlapQuery.sql).not.toContain('"status"')
    expect(mocks.requireRole).toHaveBeenCalledExactlyOnceWith('user-1', ['ADMIN', 'MANAGER'])
    expect(mocks.getTenantId).toHaveBeenCalledExactlyOnceWith('user-1')
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(schema.numeration)
    const values = {
      ...INTERNAL_NUMERATION, prefix: 'SETT', currentNumber: 0, status: 'ACTIVE',
    }
    expect(mocks.set).toHaveBeenCalledExactlyOnceWith({ ...values, updatedAt: expect.any(Date) })
    expect(dialect.sqlToQuery(mocks.updateWhere.mock.calls[0][0] as SQL).params)
      .toEqual([id, 'tenant-1'])
    expect(mocks.logAudit).toHaveBeenCalledExactlyOnceWith(
      'tenant-1', 'user-1', AuditAction.UPDATE, 'numeration', id, values,
    )
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith('/dashboard/settings')
  })

  it('reconoce SETT como interno al actualizar sin consultar documentos ni duplicados activos', async () => {
    selectResults([{ ...internal, prefix: 'SETT' }], [])

    await expect(updateNumeration(id, { endRange: 1000000 })).resolves.toEqual({ success: true })

    expectSelectTables(schema.numeration, schema.numeration)
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'SETT', endRange: 1000000 }))
    expect(mocks.logAudit).toHaveBeenCalledTimes(1)
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(1)
  })

  it.each([
    { name: 'current igual a start', currentNumber: 1, documents: [] },
    { name: 'current mayor a start', currentNumber: 2, documents: [] },
    { name: 'documento fiscal existente aunque current sea cero', currentNumber: 0, documents: [{ id: 'doc-1' }] },
  ])('bloquea cambiar el prefijo con $name', async ({ currentNumber, documents }) => {
    selectResults([{ ...internal, currentNumber }], documents)

    await expect(updateNumeration(id, { prefix: 'SETT' })).resolves.toEqual({
      success: false,
      message: 'No se puede cambiar el prefijo de la numeración interna después de emitir comprobantes. Conserve el prefijo para mantener el historial.',
    })

    expectSelectTables(schema.numeration, schema.fiscalDocument)
    expectNoMutation()
  })

  it.each(['REC', 'SETT'])('no permite desactivar la interna con prefijo %s', async (prefix) => {
    selectResults([{ ...internal, prefix }])

    await expect(updateNumeration(id, { status: 'INACTIVE' })).resolves.toEqual({
      success: false,
      message: 'La numeración interna del POS es obligatoria para emitir tickets y no se puede desactivar.',
    })

    expectSelectTables(schema.numeration)
    expectNoMutation()
  })

  it.each([
    { resolution: 'OTRA-RESOLUCION' },
    { documentType: 'FACTURA_ELECTRONICA_VENTA' },
  ])('no permite renombrar o cambiar el tipo interno: %j', async (input) => {
    selectResults([{ ...internal, prefix: 'SETT' }])

    await expect(updateNumeration(id, input)).resolves.toEqual({
      success: false,
      message: 'La numeración interna del POS no se puede renombrar ni cambiar de tipo.',
    })

    expectSelectTables(schema.numeration)
    expectNoMutation()
  })

  it('no permite reducir un consecutivo aun si el nuevo valor está dentro del rango', async () => {
    selectResults([{ ...internal, currentNumber: 5 }])

    await expect(updateNumeration(id, { currentNumber: 4 })).resolves.toEqual({
      success: false,
      message: 'No se puede reducir el consecutivo actual: ya se emitieron documentos con números mayores.',
    })

    expectSelectTables(schema.numeration)
    expectNoMutation()
  })

  it.each([
    [{ prefix: 'NO VALIDO' }, 'El prefijo debe tener entre 1 y 10 caracteres alfanuméricos, sin espacios.'],
    [{ startRange: 0 }, 'El rango inicial debe ser un entero mayor o igual a 1.'],
    [{ resolution: ' ' }, 'El número o referencia de la resolución es obligatorio.'],
  ] satisfies [Partial<NumerationInput>, string][])('devuelve fallo estructurado al normalizar %j', async (input, message) => {
    selectResults([internal])

    await expect(updateNumeration(id, input)).resolves.toEqual({ success: false, message })

    expectSelectTables(schema.numeration)
    expectNoMutation()
  })
})

describe('createNumeration y deleteNumeration', () => {
  it('create devuelve id y success literal, persiste, audita y revalida', async () => {
    selectResults([], [])

    const result = await createNumeration(external)

    expectTypeOf<Extract<typeof result, { id: string }>['success']>().toEqualTypeOf<true>()
    expect(result).toEqual({ id: expect.stringMatching(/^num_/), success: true })
    expectSelectTables(schema.numeration, schema.numeration)
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith(schema.numeration)
    expect(mocks.values).toHaveBeenCalledExactlyOnceWith({
      ...external, id: expect.any(String), tenantId: 'tenant-1',
    })
    expect(mocks.logAudit).toHaveBeenCalledExactlyOnceWith(
      'tenant-1', 'user-1', AuditAction.CREATE, 'numeration', expect.any(String), external,
    )
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith('/dashboard/settings')
  })

  it('create devuelve fallo estructurado si normalize rechaza la entrada sin consultar BD', async () => {
    await expect(createNumeration({ ...external, prefix: '!' })).resolves.toEqual({
      success: false,
      message: 'El prefijo debe tener entre 1 y 10 caracteres alfanuméricos, sin espacios.',
    })

    expectSelectTables()
    expectNoMutation()
  })

  it('delete devuelve success literal para una numeración externa sin emisiones', async () => {
    selectResults([{ ...external, id, tenantId: 'tenant-1' }])

    const result = await deleteNumeration(id)

    expectTypeOf<Extract<typeof result, { success: true }>['success']>().toEqualTypeOf<true>()
    expect(result).toEqual({ success: true })
    expectSelectTables(schema.numeration)
    expect(mocks.delete).toHaveBeenCalledExactlyOnceWith(schema.numeration)
    expect(dialect.sqlToQuery(mocks.deleteWhere.mock.calls[0][0] as SQL).params)
      .toEqual([id, 'tenant-1'])
    expect(mocks.logAudit).toHaveBeenCalledExactlyOnceWith(
      'tenant-1', 'user-1', AuditAction.DELETE, 'numeration', id, {},
    )
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith('/dashboard/settings')
  })

  it.each(['REC', 'SETT'])('no elimina una interna con prefijo %s aunque current sea cero', async (prefix) => {
    selectResults([{ ...internal, prefix }])

    await expect(deleteNumeration(id)).resolves.toEqual({
      success: false,
      message: 'La numeración interna del POS es obligatoria y no se puede eliminar.',
    })

    expectSelectTables(schema.numeration)
    expectNoMutation()
  })
})

const actions = [
  { name: 'create', run: () => createNumeration(external), fallback: 'No se pudo guardar la resolución. Intenta de nuevo.' },
  { name: 'update', run: () => updateNumeration(id, { prefix: 'SETT' }), fallback: 'No se pudo actualizar la resolución. Intenta de nuevo.' },
  { name: 'delete', run: () => deleteNumeration(id), fallback: 'No se pudo eliminar la resolución. Intenta de nuevo.' },
]

describe.each(actions)('safeAction real en $name', ({ run, fallback }) => {
  it('relanza UNAUTHORIZED desde la sesión sin consultar ni mutar', async () => {
    const error = new AppError('UNAUTHORIZED', 'Sesión expirada.')
    mocks.getUserId.mockRejectedValueOnce(error)

    await expect(run()).rejects.toBe(error)

    expect(mocks.requireRole).not.toHaveBeenCalled()
    expect(mocks.getTenantId).not.toHaveBeenCalled()
    expectSelectTables()
    expectNoMutation()
  })

  it('relanza UNAUTHORIZED desde la autorización sin consultar ni mutar', async () => {
    const error = new Error('UNAUTHORIZED')
    mocks.requireRole.mockRejectedValueOnce(error)

    await expect(run()).rejects.toBe(error)

    expect(mocks.requireRole).toHaveBeenCalledExactlyOnceWith('user-1', ['ADMIN', 'MANAGER'])
    expect(mocks.getTenantId).not.toHaveBeenCalled()
    expectSelectTables()
    expectNoMutation()
  })

  it('sanitiza errores de infraestructura con el fallback propio sin exponer SQL', async () => {
    const error = Object.assign(new Error('select * from numeration; params: tenant-secret'), {
      code: '08006', cause: new Error('connection terminated'),
    })
    mocks.select.mockImplementationOnce(() => { throw error })

    const result = await run()

    expect(result).toEqual({ success: false, message: fallback })
    expect(JSON.stringify(result)).not.toMatch(/select|numeration|tenant-secret|08006|connection terminated/i)
    expect(console.error).toHaveBeenCalledWith('[server-action]', error)
    expectNoMutation()
  })
})
