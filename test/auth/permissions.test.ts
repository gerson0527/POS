import { describe, expect, it } from 'vitest'
import {
  ACCOUNTANT_ALLOWED_PATHS,
  ALL_ROLES,
  canManageInvoiceTax,
  homePathForRole,
  isAllowedIvaRate,
  isPathAllowedForRole,
} from '@/lib/auth/permissions'

describe('isPathAllowedForRole', () => {
  it('la contadora sólo entra al módulo de facturas', () => {
    expect(isPathAllowedForRole('ACCOUNTANT', '/dashboard/invoices')).toBe(true)
    expect(isPathAllowedForRole('ACCOUNTANT', '/dashboard/invoices/')).toBe(true)
    expect(isPathAllowedForRole('ACCOUNTANT', '/dashboard')).toBe(false)
    expect(isPathAllowedForRole('ACCOUNTANT', '/dashboard/pos')).toBe(false)
    expect(isPathAllowedForRole('ACCOUNTANT', '/dashboard/inventory')).toBe(false)
    expect(isPathAllowedForRole('ACCOUNTANT', '/dashboard/reports')).toBe(false)
    expect(isPathAllowedForRole('ACCOUNTANT', '/dashboard/users')).toBe(false)
    expect(isPathAllowedForRole('ACCOUNTANT', '/dashboard/settings')).toBe(false)
  })

  it('no deja colarse a rutas que contienen el prefijo permitido', () => {
    expect(isPathAllowedForRole('ACCOUNTANT', '/dashboard/invoices-hack')).toBe(false)
  })

  it('los demás roles conservan el acceso completo', () => {
    for (const role of ['ADMIN', 'MANAGER', 'CASHIER', 'VIEWER'] as const) {
      expect(isPathAllowedForRole(role, '/dashboard/pos')).toBe(true)
      expect(isPathAllowedForRole(role, '/dashboard/inventory')).toBe(true)
      expect(isPathAllowedForRole(role, '/dashboard/settings')).toBe(true)
    }
  })
})

describe('homePathForRole', () => {
  it('la contadora entra a facturas; los demás al resumen', () => {
    expect(homePathForRole('ACCOUNTANT')).toBe('/dashboard/invoices')
    expect(homePathForRole('ADMIN')).toBe('/dashboard')
    expect(homePathForRole('CASHIER')).toBe('/dashboard')
  })
})

describe('canManageInvoiceTax', () => {
  it('la contadora, el admin y el supervisor ajustan el IVA', () => {
    expect(canManageInvoiceTax('ACCOUNTANT')).toBe(true)
    expect(canManageInvoiceTax('ADMIN')).toBe(true)
    expect(canManageInvoiceTax('MANAGER')).toBe(true)
  })

  it('el cajero y el auditor no ajustan el IVA', () => {
    expect(canManageInvoiceTax('CASHIER')).toBe(false)
    expect(canManageInvoiceTax('VIEWER')).toBe(false)
  })
})

describe('ALL_ROLES', () => {
  it('no incluye al rol contadora (queda fuera de módulos de operación)', () => {
    expect(ALL_ROLES).not.toContain('ACCOUNTANT')
    expect(ALL_ROLES).toHaveLength(4)
  })
})

describe('isAllowedIvaRate', () => {
  it('acepta las tarifas soportadas por el POS', () => {
    expect(isAllowedIvaRate(19)).toBe(true)
    expect(isAllowedIvaRate(5)).toBe(true)
    expect(isAllowedIvaRate(8)).toBe(true)
    expect(isAllowedIvaRate(0)).toBe(true)
  })

  it('rechaza tarifas no soportadas', () => {
    expect(isAllowedIvaRate(16)).toBe(false)
    expect(isAllowedIvaRate(1.6)).toBe(false)
    expect(isAllowedIvaRate(-19)).toBe(false)
  })
})

describe('ACCOUNTANT_ALLOWED_PATHS', () => {
  it('declara un único módulo permitido', () => {
    expect(ACCOUNTANT_ALLOWED_PATHS).toEqual(['/dashboard/invoices'])
  })
})
