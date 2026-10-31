import { describe, expect, it } from 'vitest'
import { movementDelta } from '@/lib/inventory/service'
import { assertActorRole } from '@/lib/auth/actor'

describe('movementDelta', () => {
  it('IN suma unidades positivas', () => {
    expect(movementDelta('IN', 5)).toBe(5)
  })

  it('OUT resta', () => {
    expect(movementDelta('OUT', 3)).toBe(-3)
  })

  it('ADJUSTMENT respeta el signo', () => {
    expect(movementDelta('ADJUSTMENT', 4)).toBe(4)
    expect(movementDelta('ADJUSTMENT', -2)).toBe(-2)
  })

  it('redondea a 2 decimales como la columna decimal(12,2)', () => {
    expect(movementDelta('IN', 1.234)).toBe(1.23)
  })

  it('rechaza cantidades inválidas', () => {
    expect(() => movementDelta('IN', 0)).toThrow()
    expect(() => movementDelta('IN', -1)).toThrow()
    expect(() => movementDelta('OUT', 0)).toThrow()
    expect(() => movementDelta('OUT', -1)).toThrow()
    expect(() => movementDelta('ADJUSTMENT', 0)).toThrow()
    expect(() => movementDelta('IN', Number.NaN)).toThrow()
    expect(() => movementDelta('IN', 10_000_000)).toThrow()
  })
})

describe('assertActorRole', () => {
  const actor = { userId: 'u1', tenantId: 't1', role: 'CASHIER' as const }

  it('permite roles autorizados', () => {
    expect(() => assertActorRole(actor, ['ADMIN', 'CASHIER'])).not.toThrow()
  })

  it('rechaza roles no autorizados', () => {
    expect(() => assertActorRole(actor, ['ADMIN', 'MANAGER'])).toThrow(/FORBIDDEN/)
  })

  it('rechaza contexto incompleto', () => {
    expect(() => assertActorRole({ ...actor, tenantId: '' }, ['CASHIER'])).toThrow(/FORBIDDEN/)
  })
})
