'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { AuditAction } from '@/lib/types'
import { and, eq, desc, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { sendWelcomeEmail } from '@/lib/email'
import { getUserId, getTenantId, logAudit, requireRole } from './_shared'
export async function createTenantWithAdmin(input: {
  // Datos del usuario admin
  adminName: string
  adminEmail: string
  adminPassword: string
  // Datos de la empresa
  companyName: string
  companyLegalName: string
  companyNit: string
  companyDv?: string
  companyTradeName?: string
  companyEmail?: string
  companyPhone?: string
  companyAddress?: string
  companyCity?: string
  companyDepartment?: string
  companyCountry?: string
  companyLegalRepresentative?: string
  companyLegalRepDocNumber?: string
  companyEconomicActivity?: string
  companyWebsite?: string
}) {
  const currentUserId = await getUserId()
  await requireRole(currentUserId, ['ADMIN'])
  const currentTenantId = await getTenantId(currentUserId)

  // 1. Validar que el email no exista ya
  const existing = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, input.adminEmail))
    .limit(1)

  if (existing.length > 0) {
    throw new Error(`El correo ${input.adminEmail} ya está registrado. Use otro.`)
  }

  // 2. Validar NIT (único en tenant)
  const nitClean = input.companyNit.replace(/[\s.-]/g, '')
  const existingNit = await db
    .select()
    .from(schema.tenant)
    .where(eq(schema.tenant.nit, nitClean))
    .limit(1)
  if (existingNit.length > 0) {
    throw new Error(`El NIT ${input.companyNit} ya está registrado.`)
  }

  // 3. Generar slug único para DB del tenant
  const baseSlug = input.companyName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 40) || 'tenant'
  let dbSlug = baseSlug
  let counter = 1
  while (
    await db
      .select({ id: schema.tenant.id })
      .from(schema.tenant)
      .where(eq(schema.tenant.dbSlug, dbSlug))
      .limit(1)
  ) {
    counter++
    dbSlug = `${baseSlug}-${counter}`
    if (counter > 100) {
      dbSlug = `tenant-${Date.now()}`
      break
    }
  }

  // 4. Crear el tenant
  const tenantId = `tenant_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  await db.insert(schema.tenant).values({
    id: tenantId,
    name: input.companyName.trim(),
    legalName: input.companyLegalName.trim(),
    nit: nitClean,
    tradeName: input.companyTradeName?.trim() || null,
    email: input.companyEmail?.trim() || input.adminEmail.trim(),
    phone: input.companyPhone?.trim() || null,
    address: input.companyAddress?.trim() || null,
    city: input.companyCity?.trim() || null,
    department: input.companyDepartment?.trim() || null,
    country: input.companyCountry?.trim() || 'Colombia',
    legalRepresentative: input.companyLegalRepresentative?.trim() || null,
    legalRepDocNumber: input.companyLegalRepDocNumber?.trim() || null,
    economicActivity: input.companyEconomicActivity?.trim() || null,
    website: input.companyWebsite?.trim() || null,
    dbSlug,
    dbProvisioned: 'NO', // Stage 2: marcar como 'SI' cuando la DB exista
    status: 'ACTIVE',
    onboardingCompleted: 'SI',
    onboardingCompletedAt: new Date(),
    onboardingCompletedBy: currentUserId,
  })

  // 5. Crear el usuario admin
  const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
  await db.insert(schema.user).values({
    id: userId,
    name: input.adminName.trim(),
    email: input.adminEmail.trim(),
    emailVerified: true,
  })

  // 6. Crear cuenta con la contraseña
  await db.insert(schema.account).values({
    id: `acc_${Date.now()}`,
    accountId: input.adminEmail.trim(),
    providerId: 'credential',
    userId,
    password: input.adminPassword,
  })

  // 7. Vincular como ADMIN del nuevo tenant
  await db.insert(schema.userTenant).values({
    id: `ut_${Date.now()}`,
    userId,
    tenantId,
    role: 'ADMIN',
    status: 'ACTIVE',
  })

  // 8. Log de auditoría (en el tenant del admin actual, que registra al nuevo)
  await logAudit(currentTenantId, currentUserId, AuditAction.CREATE, 'tenant', tenantId, {
    name: input.companyName,
    nit: nitClean,
    dbSlug,
    adminEmail: input.adminEmail,
  })

  // 9. Provisionar la BD del nuevo tenant (crea la DB física + corre migraciones)
  let provisionMessage = ''
  try {
    const { provisionTenantDatabase } = await import('@/lib/db/tenant-provisioner')
    const prov = await provisionTenantDatabase(dbSlug)
    if (prov.ok) {
      provisionMessage = ` · BD ${prov.message}`
      // Marcar como provisionada
      await db
        .update(schema.tenant)
        .set({ dbProvisioned: 'SI', dbLastSyncAt: new Date() })
        .where(eq(schema.tenant.id, tenantId))
    } else {
      provisionMessage = ` · âš  BD no provisionada: ${prov.message}`
    }
  } catch (provErr: any) {
    provisionMessage = ` · âš  Error provisionando: ${provErr.message}`
  }

  // 10. Email de bienvenida (opcional, no bloquea)
  try {
    await sendWelcomeEmail(input.adminEmail, input.adminName, 'ADMIN')
  } catch (emailErr) {
    console.error('Error enviando correo de bienvenida:', emailErr)
  }

  revalidatePath('/dashboard/users')
  return {
    success: true,
    tenantId,
    userId,
    dbSlug,
    message: `Empresa "${input.companyName}" creada${provisionMessage}. Credenciales enviadas a ${input.adminEmail}.`,
  }
}

// Lista todos los tenants (empresas) del sistema â€” solo para el admin master.
// Útil para que el admin master gestione todas las SAS registradas.
export async function listAllTenants() {
  const currentUserId = await getUserId()
  const currentTenantId = await getTenantId(currentUserId)

  // Solo el admin master puede listar todos los tenants
  const memberships = await db
    .select()
    .from(schema.userTenant)
    .where(
      and(
        eq(schema.userTenant.userId, currentUserId),
        eq(schema.userTenant.tenantId, currentTenantId)
      )
    )
    .limit(1)
  if (!memberships[0] || memberships[0].role !== 'ADMIN') {
    throw new Error('Solo el admin master puede listar todos los tenants.')
  }

  const tenants = await db
    .select()
    .from(schema.tenant)
    .orderBy(desc(schema.tenant.createdAt))

  // Para cada tenant, obtener el admin (owner)
  const result = []
  for (const t of tenants) {
    const adminUser = await db
      .select({
        email: schema.user.email,
        name: schema.user.name,
      })
      .from(schema.userTenant)
      .innerJoin(schema.user, eq(schema.user.id, schema.userTenant.userId))
      .where(
        and(
          eq(schema.userTenant.tenantId, t.id),
          eq(schema.userTenant.role, 'ADMIN'),
          eq(schema.userTenant.status, 'ACTIVE')
        )
      )
      .limit(1)
    const { count: userCount } = (await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.userTenant)
      .where(eq(schema.userTenant.tenantId, t.id)))[0] || { count: 0 }
    result.push({
      ...t,
      adminEmail: adminUser[0]?.email || null,
      adminName: adminUser[0]?.name || null,
      userCount: Number(userCount || 0),
    })
  }
  return result
}

