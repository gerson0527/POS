'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { AuditAction } from '@/lib/types'
import { and, eq, desc, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { sendWelcomeEmail } from '@/lib/email'
import { hashPassword } from 'better-auth/crypto'
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

  const platformUser = await db
    .select({ email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, currentUserId))
    .limit(1)
  const platformAdmins = (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
  if (
    !platformUser[0]?.email ||
    !platformAdmins.includes(platformUser[0].email.toLowerCase())
  ) {
    throw new Error('Solo el administrador de plataforma puede crear tenants.')
  }

  const adminEmail = input.adminEmail.trim().toLowerCase()
  const adminName = input.adminName.trim()
  if (!adminName) throw new Error('El nombre del administrador es obligatorio.')
  if (!adminEmail.includes('@')) throw new Error('El correo del administrador no es válido.')
  if ((input.adminPassword || '').length < 12) {
    throw new Error('La contraseña del administrador debe tener al menos 12 caracteres.')
  }

  // 1. Validar que el email no exista ya
  const existing = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, adminEmail))
    .limit(1)

  if (existing.length > 0) {
    throw new Error(`El correo ${adminEmail} ya está registrado. Use otro.`)
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

  if (!input.companyName?.trim() || !input.companyLegalName?.trim() || !nitClean) {
    throw new Error('Nombre, razón social y NIT son obligatorios.')
  }

  const tenantId = `tenant_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
  const passwordHash = await hashPassword(input.adminPassword)

  // Tenant, usuario, credenciales y membresía se crean en una sola transacción.
  await db.transaction(async (tx) => {
    await tx.insert(schema.tenant).values({
      id: tenantId,
      name: input.companyName.trim(),
      legalName: input.companyLegalName.trim(),
      nit: nitClean,
      tradeName: input.companyTradeName?.trim() || null,
      email: input.companyEmail?.trim() || adminEmail,
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
      dbProvisioned: 'NO',
      status: 'ACTIVE',
      onboardingCompleted: 'SI',
      onboardingCompletedAt: new Date(),
      onboardingCompletedBy: currentUserId,
    })

    await tx.insert(schema.user).values({
      id: userId,
      name: adminName,
      email: adminEmail,
      emailVerified: true,
    })

    await tx.insert(schema.account).values({
      id: `acc_${Date.now()}`,
      accountId: adminEmail,
      providerId: 'credential',
      userId,
      password: passwordHash,
    })

    await tx.insert(schema.userTenant).values({
      id: `ut_${Date.now()}`,
      userId,
      tenantId,
      role: 'ADMIN',
      status: 'ACTIVE',
    })
  })

  // 8. Log de auditoría (en el tenant del admin actual, que registra al nuevo)
  await logAudit(currentTenantId, currentUserId, AuditAction.CREATE, 'tenant', tenantId, {
    name: input.companyName,
    nit: nitClean,
    dbSlug,
    adminEmail,
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
    await sendWelcomeEmail(adminEmail, adminName, 'ADMIN')
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

  const membership = await requireRole(currentUserId, ['ADMIN'])
  if (membership.tenantId !== currentTenantId) {
    throw new Error('No se pudo validar el tenant activo.')
  }

  // El listado global solo lo pueden ver los correos configurados como
  // administradores de plataforma. Sin lista configurada se deniega.
  const userRows = await db
    .select({ email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, currentUserId))
    .limit(1)
  const allowedEmails = (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
  if (!userRows[0]?.email || !allowedEmails.includes(userRows[0].email.toLowerCase())) {
    throw new Error('Solo el administrador de plataforma puede listar todos los tenants.')
  }

  const tenants = await db
    .select({
      id: schema.tenant.id,
      name: schema.tenant.name,
      legalName: schema.tenant.legalName,
      nit: schema.tenant.nit,
      tradeName: schema.tenant.tradeName,
      email: schema.tenant.email,
      phone: schema.tenant.phone,
      address: schema.tenant.address,
      city: schema.tenant.city,
      department: schema.tenant.department,
      country: schema.tenant.country,
      dbSlug: schema.tenant.dbSlug,
      dbProvisioned: schema.tenant.dbProvisioned,
      status: schema.tenant.status,
      onboardingCompleted: schema.tenant.onboardingCompleted,
      createdAt: schema.tenant.createdAt,
    })
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

