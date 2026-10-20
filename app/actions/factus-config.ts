'use server'
// Extraído de pos-actions.ts (Fase 3: partición por dominios).
// El barrel pos-actions.ts re-exporta todo este módulo.
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'
import { AuditAction } from '@/lib/types'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import {
  buildFactusAuditPayload,
  buildFactusConfigUpdate,
  describeFactusUpdate,
  type FactusConfigInput,
} from '@/lib/invoicing/tenant-credentials'
import { getUserId, getTenantId, logAudit, requireRole } from './_shared'
export async function updateTenantFactusConfig(input: FactusConfigInput) {
  const userId = await getUserId()
  await requireRole(userId, ['ADMIN'])
  const tenantId = await getTenantId(userId)

  // Sin rango de numeración no se puede emitir: se rechaza el guardado de una
  // configuración "a medias" en lugar de fallar luego al cobrar una venta.
  if (input.factusNumberingRangeId !== undefined) {
    const rangeId = Number(input.factusNumberingRangeId)
    if (!Number.isInteger(rangeId) || rangeId < 0) {
      throw new Error('El ID del rango de numeración debe ser un entero positivo.')
    }
    if (rangeId === 0 && input.factusClientId) {
      throw new Error(
        'Seleccione un rango de numeración válido (botón "Listar rangos del proveedor") antes de guardar la configuración.'
      )
    }
  }

  // Cifrado de campos sensibles + redacción para logs/auditoría: fuente única en
  // lib/invoicing/tenant-credentials.ts (Fase 4.25). buildFactusConfigUpdate aplica
  // las reglas "vacío = no cambiar" para los secretos.
  const update: any = { ...buildFactusConfigUpdate(input), updatedAt: new Date() }

  // Asegurar que el tenant exista con TODOS los campos requeridos (no solo los mínimos)
  // porque el INSERT con DO NOTHING deja los campos factus* en NULL si ya existía.
  // Primero verificamos si existe
  const existingTenant = await db
    .select({ id: schema.tenant.id })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, tenantId))
    .limit(1)

  if (!existingTenant.length) {
    console.log('[DEBUG] Tenant no existe, creándolo con id:', tenantId)
    await db
      .insert(schema.tenant)
      .values({
        id: tenantId,
        name: 'POS Tenant',
        legalName: 'POS Tenant',
        nit: '000000000',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
  }

  // Sin secretos en logs: solo registramos QUÉ campos se actualizaron, nunca valores.
  console.log('[DEBUG] Ejecutando UPDATE sobre tenant:', tenantId, 'campos:', describeFactusUpdate(update))

  const updateResult = await db
    .update(schema.tenant)
    .set(update)
    .where(eq(schema.tenant.id, tenantId))
    .returning({
      id: schema.tenant.id,
      factusClientId: schema.tenant.factusClientId,
      factusUsername: schema.tenant.factusUsername,
      factusEnvironment: schema.tenant.factusEnvironment,
      factusNumberingRangeId: schema.tenant.factusNumberingRangeId,
    })

  console.log('[DEBUG] Resultado UPDATE: filas afectadas =', updateResult.length)

  // Auditoría sin secretos: registramos qué se actualizó, nunca los valores.
  await logAudit(tenantId, userId, AuditAction.UPDATE, 'tenant_factus_config', tenantId, buildFactusAuditPayload(update))

  revalidatePath('/dashboard/settings')
  return { success: true, updated: updateResult }
}

