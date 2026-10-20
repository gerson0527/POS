import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import { safeAction } from '@/app/actions/_result'

describe('safeAction', () => {
  it('devuelve el resultado exitoso sin cambios', async () => {
    const result = await safeAction(async () => ({ success: true as const, saleId: 'sale_1' }))
    expect(result).toEqual({ success: true, saleId: 'sale_1' })
  })

  it('convierte errores de negocio en mensajes claros', async () => {
    const result = await safeAction(async () => {
      throw new Error('No hay una caja abierta para la fecha de hoy.')
    })
    expect(result).toEqual({
      success: false,
      message: 'No hay una caja abierta para la fecha de hoy.',
    })
  })

  it('oculta errores internos/BD detrás del mensaje genérico', async () => {
    const dbError = Object.assign(new Error('insert into sale ... params: 123'), {
      code: '23505',
      cause: new Error('duplicate key'),
    })
    const result = await safeAction(async () => {
      throw dbError
    }, 'No se pudo crear la venta.')
    expect(result).toEqual({ success: false, message: 'No se pudo crear la venta.' })
  })

  it('relanza UNAUTHORIZED para que el cliente redirija al login', async () => {
    await expect(
      safeAction(async () => {
        throw new AppError('UNAUTHORIZED', 'Sesión expirada.')
      })
    ).rejects.toThrow('UNAUTHORIZED')
  })
})
