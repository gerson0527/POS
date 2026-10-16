'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { AuditAction } from '@/lib/types'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUserId, getTenantId, logAudit } from './_shared'
export async function getCompanyInfo() {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const tenants = await db
    .select()
    .from(schema.tenant)
    .where(eq(schema.tenant.id, tenantId))
    .limit(1)

  if (tenants.length > 0) {
    return tenants[0]
  }

  return {
    id: tenantId,
    name: '',
    legalName: '',
    nit: '',
    email: '',
    phone: '',
    address: '',
    dianSoftwareId: '',
    dianSoftwarePin: '',
    dianUsername: '',
    dianPassword: '',
    dianTestSetId: '',
    dianEnvironment: '2',
  }
}

// ============================================================
// ONBOARDING â€” wizard de primera vez para el admin del tenant
// ============================================================

export interface OnboardingCompanyData {
  name: string
  legalName: string
  tradeName?: string
  nit: string
  dv?: string
  email: string
  phone: string
  address: string
  city: string
  department: string
  country?: string
  legalRepresentative?: string
  legalRepDocNumber?: string
  economicActivity?: string
  website?: string
}

export interface OnboardingStatus {
  completed: boolean
  completedAt: string | null
  completedBy: string | null
  isAdmin: boolean
  tenantName: string | null
  tenantNit: string | null
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  // Verificar si el usuario es ADMIN del tenant
  const memberships = await db
    .select()
    .from(schema.userTenant)
    .where(
      and(
        eq(schema.userTenant.userId, userId),
        eq(schema.userTenant.tenantId, tenantId)
      )
    )
    .limit(1)

  const membership = memberships[0]
  const isAdmin = membership?.role === 'ADMIN'

  // Leer tenant
  const tenants = await db
    .select()
    .from(schema.tenant)
    .where(eq(schema.tenant.id, tenantId))
    .limit(1)

  const tenant: any = tenants[0] || { name: '', nit: '' }

  return {
    completed: tenant.onboardingCompleted === 'SI' || tenant.onboardingCompleted === 'YES',
    completedAt: tenant.onboardingCompletedAt ? tenant.onboardingCompletedAt.toISOString() : null,
    completedBy: tenant.onboardingCompletedBy || null,
    isAdmin,
    tenantName: tenant.name || null,
    tenantNit: tenant.nit || null,
  }
}

export async function completeTenantOnboarding(input: OnboardingCompanyData) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  // Validar que sea ADMIN
  const memberships = await db
    .select()
    .from(schema.userTenant)
    .where(
      and(
        eq(schema.userTenant.userId, userId),
        eq(schema.userTenant.tenantId, tenantId)
      )
    )
    .limit(1)
  if (!memberships[0] || memberships[0].role !== 'ADMIN') {
    throw new Error('Solo un administrador puede completar el onboarding de la empresa.')
  }

  // Validar campos mínimos
  if (!input.name?.trim()) throw new Error('El nombre comercial es obligatorio.')
  if (!input.legalName?.trim()) throw new Error('La razón social es obligatoria.')
  if (!input.nit?.trim()) throw new Error('El NIT es obligatorio.')
  if (!input.email?.trim()) throw new Error('El email de la empresa es obligatorio.')
  if (!input.phone?.trim()) throw new Error('El teléfono es obligatorio.')
  if (!input.address?.trim()) throw new Error('La dirección es obligatoria.')
  if (!input.city?.trim()) throw new Error('La ciudad es obligatoria.')
  if (!input.department?.trim()) throw new Error('El departamento es obligatorio.')

  // Separar NIT y DV
  const rawNit = input.nit.replace(/[\s.-]/g, '')
  let nit = rawNit
  let dv: string | null = null
  if (rawNit.length > 9 && !input.dv) {
    dv = rawNit.slice(-1)
    nit = rawNit.slice(0, -1)
  } else if (input.dv) {
    dv = input.dv
  }

  // Actualizar tenant + marcar onboarding como completo (atómico)
  await db
    .update(schema.tenant)
    .set({
      name: input.name.trim(),
      legalName: input.legalName.trim(),
      tradeName: input.tradeName?.trim() || null,
      nit,
      email: input.email.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      city: input.city.trim(),
      department: input.department.trim(),
      country: input.country?.trim() || 'Colombia',
      legalRepresentative: input.legalRepresentative?.trim() || null,
      legalRepDocNumber: input.legalRepDocNumber?.trim() || null,
      economicActivity: input.economicActivity?.trim() || null,
      website: input.website?.trim() || null,
      onboardingCompleted: 'SI',
      onboardingCompletedAt: new Date(),
      onboardingCompletedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(schema.tenant.id, tenantId))

  // Guardar DV en un campo dedicado (no existe en schema â€” lo guardamos en legalRepDocNumber no, mejor lo dejamos libre)
  void dv

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'tenant_onboarding', tenantId, {
    completed: true,
    fields: Object.keys(input),
  })

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/onboarding')
  return { success: true }
}

export async function updateCompanyInfo(input: {
  name: string
  legalName?: string
  nit: string
  email?: string
  phone?: string
  address?: string
  dianSoftwareId?: string
  dianSoftwarePin?: string
  dianUsername?: string
  dianPassword?: string
  dianTestSetId?: string
  dianEnvironment?: string
}) {
  const userId = await getUserId()
  const tenantId = await getTenantId(userId)

  const tenants = await db
    .select()
    .from(schema.tenant)
    .where(eq(schema.tenant.id, tenantId))
    .limit(1)

  if (tenants.length > 0) {
    await db
      .update(schema.tenant)
      .set({
        name: input.name,
        legalName: input.legalName || input.name,
        nit: input.nit,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
        dianSoftwareId: input.dianSoftwareId || null,
        dianSoftwarePin: input.dianSoftwarePin || null,
        dianUsername: input.dianUsername || null,
        dianPassword: input.dianPassword || null,
        dianTestSetId: input.dianTestSetId || null,
        dianEnvironment: input.dianEnvironment || '2',
        updatedAt: new Date(),
      })
      .where(eq(schema.tenant.id, tenantId))
  } else {
    await db.insert(schema.tenant).values({
      id: tenantId,
      name: input.name,
      legalName: input.legalName || input.name,
      nit: input.nit,
      email: input.email || null,
      phone: input.phone || null,
      address: input.address || null,
      dianSoftwareId: input.dianSoftwareId || null,
      dianSoftwarePin: input.dianSoftwarePin || null,
      dianUsername: input.dianUsername || null,
      dianPassword: input.dianPassword || null,
      dianTestSetId: input.dianTestSetId || null,
      dianEnvironment: input.dianEnvironment || '2',
      status: 'ACTIVE',
    })
  }

  await logAudit(tenantId, userId, AuditAction.UPDATE, 'tenant', tenantId, input)
  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard')
  return { success: true }
}

/** Actualiza solo la configuración del proveedor de facturación electrónica del tenant.
 *  Separado de updateCompanyInfo para que la UI tenga endpoints separados
 *  (un cambio de credenciales no debería requerir re-guardar "GENERAL EMPRESA"). */
