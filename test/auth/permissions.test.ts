import { describe, expect, it } from 'vitest'
import {
  ACCOUNTANT_ALLOWED_PATHS,
  ALL_ROLES,
  canManageInvoiceTax,
  canManageUsers,
  homePathForRole,
  isAllowedIvaRate,
  isPathAllowedForRole,
  isPlatformAdminEmail,
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

  it('los demás roles conservan el acceso operativo (salvo usuarios)', () => {
    for (const role of ['ADMIN', 'MANAGER', 'CASHIER', 'VIEWER'] as const) {
      expect(isPathAllowedForRole(role, '/dashboard/pos')).toBe(true)
      expect(isPathAllowedForRole(role, '/dashboard/inventory')).toBe(true)
      expect(isPathAllowedForRole(role, '/dashboard/settings')).toBe(true)
    }
  })

  it('solo ADMIN entra al módulo de usuarios', () => {
    expect(isPathAllowedForRole('ADMIN', '/dashboard/users')).toBe(true)
    expect(isPathAllowedForRole('MANAGER', '/dashboard/users')).toBe(false)
    expect(isPathAllowedForRole('CASHIER', '/dashboard/users')).toBe(false)
    expect(isPathAllowedForRole('VIEWER', '/dashboard/users')).toBe(false)
  })
})

describe('canManageUsers', () => {
  it('solo el administrador gestiona usuarios', () => {
    expect(canManageUsers('ADMIN')).toBe(true)
    expect(canManageUsers('MANAGER')).toBe(false)
    expect(canManageUsers('CASHIER')).toBe(false)
    expect(canManageUsers('VIEWER')).toBe(false)
    expect(canManageUsers('ACCOUNTANT')).toBe(false)
  })
})

describe('isPlatformAdminEmail', () => {
  it('reconoce admin@posdian.com y dominio @posdian.com', () => {
    expect(isPlatformAdminEmail('admin@posdian.com')).toBe(true)
    expect(isPlatformAdminEmail('ops@posdian.com')).toBe(true)
    expect(isPlatformAdminEmail('gerson@gmail.com')).toBe(false)
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
