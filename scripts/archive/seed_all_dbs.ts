import dotenv from 'dotenv'
dotenv.config()

import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { betterAuth } from 'better-auth'
import * as schema from '../lib/db/schema'
import { eq, and } from 'drizzle-orm'

const dbUrls = [
  'postgresql://postgres@localhost:5432/pruebas_POS',
  'postgresql://posuser:pospassword@localhost:5432/posdian'
]

const usersToSeed = [
  {
    email: 'admin@posdian.com',
    password: 'Admin123456!',
    name: 'Administrador Master (SOC Command)',
    role: 'ADMIN',
  },
  {
    email: 'gersongio0527@gmail.com',
    password: '12345678password',
    name: 'Gerson Ortiz',
    role: 'ADMIN',
  },
]

async function seedDatabase(url: string) {
  console.log(`\n==================================================`)
  console.log(`🌱 Poblando Base de Datos: ${url}`)
  console.log(`==================================================`)

  const pool = new Pool({ connectionString: url })
  const db = drizzle(pool, { schema })

  try {
    // 1. Verificar/Crear Tenant Default
    const tenantId = 'tenant_default'
    const existingTenants = await db.select().from(schema.tenant).where(eq(schema.tenant.id, tenantId))
    if (!existingTenants.length) {
      await db.insert(schema.tenant).values({
        id: tenantId,
        name: 'Comercializadora POS Retail S.A.S.',
        nit: '901234567-8',
        legalName: 'Comercializadora POS Retail S.A.S.',
        email: 'facturacion@posretail.co',
        phone: '+57 601 555 0199',
        address: 'Carrera 15 # 93-47, Bogotá, D.C.',
        dianEnvironment: 'TEST',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      console.log('✅ Tenant por defecto insertado')
    } else {
      console.log('ℹ️ Tenant por defecto ya existe')
    }

    // 2. Auth Instance para esta base de datos
    const archiveSecret = process.env.BETTER_AUTH_SECRET
    if (!archiveSecret) throw new Error('BETTER_AUTH_SECRET no está definida (.env)')
    const auth = betterAuth({
      database: pool,
      secret: archiveSecret,
      emailAndPassword: { enabled: true, minPasswordLength: 12 },
    })

    // 3. Crear Usuarios & Membresías
    for (const u of usersToSeed) {
      const existingUsers = await db.select().from(schema.user).where(eq(schema.user.email, u.email))

      if (!existingUsers.length) {
        try {
          await auth.api.signUpEmail({
            body: {
              email: u.email,
              password: u.password,
              name: u.name,
            },
          })
          console.log(`✅ Usuario (${u.email}) registrado exitosamente`)
        } catch (err: any) {
          console.log(`ℹ️ Usuario (${u.email}) error al registrar:`, err?.message || err)
        }
      } else {
        console.log(`ℹ️ Usuario (${u.email}) ya existía en esta BD`)
      }

      // Obtener ID de usuario recién creado o existente
      const freshUser = await db.select().from(schema.user).where(eq(schema.user.email, u.email))
      if (freshUser.length > 0) {
        const userId = freshUser[0].id
        const existingUt = await db.select().from(schema.userTenant).where(
          and(
            eq(schema.userTenant.userId, userId),
            eq(schema.userTenant.tenantId, tenantId)
          )
        )
        if (!existingUt.length) {
          await db.insert(schema.userTenant).values({
            id: `ut_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            userId,
            tenantId,
            role: u.role,
            status: 'ACTIVE',
            createdAt: new Date(),
          })
          console.log(`✅ Membresía user_tenant (ADMIN) asignada a ${u.email}`)
        } else {
          console.log(`ℹ️ Membresía user_tenant (ADMIN) verificada para ${u.email}`)
        }
      }
    }
  } catch (err: any) {
    console.error(`❌ Error poblando ${url}:`, err?.message || err)
  } finally {
    await pool.end()
  }
}

async function run() {
  for (const url of dbUrls) {
    await seedDatabase(url)
  }
  console.log(`\n🎉 PROCESO COMPLETADO EN TODAS LAS BASES DE DATOS.`)
}

run()
