import dotenv from 'dotenv'
dotenv.config()

import { db, pool } from '../lib/db'
import { runMigrations } from '../lib/db/migrate'
import * as schema from '../lib/db/schema'
import { eq } from 'drizzle-orm'

export async function runSeed() {
  console.log('🌱 Iniciando Generación de Semilla POS DIAN (10 Proveedores, 100 Productos, Inventarios & Clientes)...')

  await runMigrations(pool, { adoptExisting: true })

  const tenantId = 'tenant_default'

  // 0. Usuario Administrador
  const usersToSeed = [
    {
      email: 'gersongio0527@gmail.com',
      password: '12345678password',
      name: 'Gerson Ortiz',
      role: 'ADMIN',
    },
  ]

  const { betterAuth } = await import('better-auth')
  const seedSecret = process.env.BETTER_AUTH_SECRET
  if (!seedSecret) throw new Error('BETTER_AUTH_SECRET no está definida (.env)')
  const auth = betterAuth({
    database: pool,
    secret: seedSecret,
    emailAndPassword: { enabled: true, minPasswordLength: 12 },
  })

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
        console.log(`✅ Usuario ${u.email} registrado en la base de datos`)
      } catch (err: any) {
        console.log(`ℹ️ Usuario ${u.email} procesado:`, err?.message || err)
      }
    } else {
      console.log(`ℹ️ Usuario ${u.email} ya existe en la base de datos`)
    }

    // Asegurar vinculación en user_tenant con rol ADMIN
    const freshUser = await db.select().from(schema.user).where(eq(schema.user.email, u.email))
    if (freshUser.length > 0) {
      const userId = freshUser[0].id
      const existingUt = await db.select().from(schema.userTenant).where(eq(schema.userTenant.userId, userId))
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
        console.log(`ℹ️ Membresía user_tenant verificada para ${u.email}`)
      }
    }
  }

  // 1. Tenant por defecto
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
      onboardingCompleted: 'SI',
      onboardingCompletedAt: new Date(),
      onboardingCompletedBy: 'admin@posdian.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    console.log('✅ Tenant por defecto verificado')
  } else {
    await db
      .update(schema.tenant)
      .set({
        onboardingCompleted: 'SI',
        onboardingCompletedAt: new Date(),
        onboardingCompletedBy: 'admin@posdian.com',
      })
      .where(eq(schema.tenant.id, tenantId))
  }

  // 2. Sucursales (3 Sólidas en Principales Ciudades)
  const locationsData = [
    { id: 'loc_bogota_01', tenantId, name: 'Sede Principal - Chicó (Bogotá)', code: 'BOG-01', address: 'Carrera 15 # 93-47', city: 'Bogotá D.C.', phone: '6015550199', status: 'ACTIVE' },
    { id: 'loc_medellin_01', tenantId, name: 'Sucursal El Poblado (Medellín)', code: 'MDE-01', address: 'Calle 10 # 43E-12', city: 'Medellín', phone: '6044440188', status: 'ACTIVE' },
    { id: 'loc_cali_01', tenantId, name: 'Sucursal Zona Rosa (Cali)', code: 'CLO-01', address: 'Avenida 6N # 26N-15', city: 'Cali', phone: '6023330177', status: 'ACTIVE' },
  ]

  for (const loc of locationsData) {
    const existing = await db.select().from(schema.location).where(eq(schema.location.id, loc.id))
    if (!existing.length) {
      await db.insert(schema.location).values({ ...loc, createdAt: new Date(), updatedAt: new Date() })
    }
  }
  console.log('✅ 3 Sucursales registradas (Bogotá, Medellín, Cali)')

  // 3. 10 Proveedores Colombianos Reales
  const suppliersData = [
    { id: 'supp_001', tenantId, name: 'Alquería S.A.', nit: '860000520-2', email: 'pedidos@alqueria.com.co', phone: '6018000111', address: 'Cajicá Km 25', city: 'Cajicá', contactPerson: 'Luis Fernando Tobón', paymentTerms: '30_DIAS', status: 'ACTIVE' },
    { id: 'supp_002', tenantId, name: 'Grupo Nutresa S.A.', nit: '890900120-4', email: 'servicioalcliente@nutresa.com', phone: '6043159000', address: 'Carrera 52 # 2-38', city: 'Medellín', contactPerson: 'Claudia Patricia Mejía', paymentTerms: '45_DIAS', status: 'ACTIVE' },
    { id: 'supp_003', tenantId, name: 'Bavaria S.A.', nit: '890900608-9', email: 'atencioncomercial@bavaria.co', phone: '6016389000', address: 'Carrera 53A # 127-35', city: 'Bogotá D.C.', contactPerson: 'Hernán Darío Castro', paymentTerms: '15_DIAS', status: 'ACTIVE' },
    { id: 'supp_004', tenantId, name: 'Procter & Gamble Colombia S.A.', nit: '860005224-1', email: 'ordenes@pg.com', phone: '6015931000', address: 'Calle 98 # 22-64', city: 'Bogotá D.C.', contactPerson: 'Andrea Ospina', paymentTerms: '60_DIAS', status: 'ACTIVE' },
    { id: 'supp_005', tenantId, name: 'Postobón S.A.', nit: '890900050-1', email: 'ventas@postobon.com.co', phone: '6042655100', address: 'Calle 52 # 47-42', city: 'Medellín', contactPerson: 'Carlos Alberto Vélez', paymentTerms: '30_DIAS', status: 'ACTIVE' },
    { id: 'supp_006', tenantId, name: 'Colombina S.A.', nit: '890300021-3', email: 'servicio@colombina.com', phone: '6028861000', address: 'Carrera 1 # 24-56', city: 'Cali', contactPerson: 'Beatriz Elena Gómez', paymentTerms: '30_DIAS', status: 'ACTIVE' },
    { id: 'supp_007', tenantId, name: 'Alpina Productos Alimenticios S.A.', nit: '860002554-3', email: 'contacto@alpina.com', phone: '6014238600', address: 'Carrera 85D # 46A-65', city: 'Bogotá D.C.', contactPerson: 'Jorge Enrique Ramírez', paymentTerms: '30_DIAS', status: 'ACTIVE' },
    { id: 'supp_008', tenantId, name: 'Unilever Andina Colombia S.A.S.', nit: '860001099-5', email: 'atencion.unilever@unilever.com', phone: '6017420000', address: 'Calle 99 # 10-02', city: 'Bogotá D.C.', contactPerson: 'Diana Carolina Ruiz', paymentTerms: '45_DIAS', status: 'ACTIVE' },
    { id: 'supp_009', tenantId, name: 'Compañía Nacional de Chocolates S.A.S.', nit: '890900060-6', email: 'chocolates@chocolates.com.co', phone: '6043656000', address: 'Carrera 43A # 1-50', city: 'Medellín', contactPerson: 'Mauricio Saldarriaga', paymentTerms: '30_DIAS', status: 'ACTIVE' },
    { id: 'supp_010', tenantId, name: 'Nestlé de Colombia S.A.', nit: '860002130-1', email: 'servicio.cliente@co.nestle.com', phone: '6015465500', address: 'Transversal 18 # 96-41', city: 'Bogotá D.C.', contactPerson: 'Santiago Mendoza', paymentTerms: '30_DIAS', status: 'ACTIVE' },
  ]

  for (const s of suppliersData) {
    const existing = await db.select().from(schema.supplier).where(eq(schema.supplier.id, s.id))
    if (!existing.length) {
      await db.insert(schema.supplier).values({ ...s, createdAt: new Date(), updatedAt: new Date() })
    }
  }
  console.log('✅ 10 Proveedores mayoristas registrados')

  // 4. Clientes Colombianos Reales (10 Clientes)
  const customersData = [
    { id: 'cust_001', tenantId, documentType: 'CC', documentNumber: '1018432910', personType: 'NATURAL', name: 'Carlos Eduardo Gómez Silva', email: 'carlos.gomez@gmail.com', phone: '3104567890', address: 'Calle 140 # 11-35', city: 'Bogotá D.C.', department: 'Cundinamarca', taxRegime: 'NO_RESPONSABLE_IVA', status: 'ACTIVE' },
    { id: 'cust_002', tenantId, documentType: 'NIT', documentNumber: '800197432-1', personType: 'JURIDICA', name: 'Supermercados La 80 S.A.S.', email: 'compras@la80.com.co', phone: '6042309888', address: 'Carrera 80 # 45-20', city: 'Medellín', department: 'Antioquia', taxRegime: 'RESPONSABLE_IVA', status: 'ACTIVE' },
    { id: 'cust_003', tenantId, documentType: 'CC', documentNumber: '52849102', personType: 'NATURAL', name: 'María Fernanda Restrepo Morales', email: 'mafe.restrepo@outlook.com', phone: '3158901234', address: 'Calle 5 # 38-12', city: 'Cali', department: 'Valle del Cauca', taxRegime: 'NO_RESPONSABLE_IVA', status: 'ACTIVE' },
    { id: 'cust_004', tenantId, documentType: 'CC', documentNumber: '1029384756', personType: 'NATURAL', name: 'Juan Camilo Rodríguez Vargas', email: 'juanca.rodriguez@gmail.com', phone: '3007654321', address: 'Carrera 7 # 127-10', city: 'Bogotá D.C.', department: 'Cundinamarca', taxRegime: 'NO_RESPONSABLE_IVA', status: 'ACTIVE' },
    { id: 'cust_005', tenantId, documentType: 'NIT', documentNumber: '900543210-9', personType: 'JURIDICA', name: 'Distribuidora Andina de Alimentos Ltda', email: 'ventas@distriandina.com', phone: '6013204555', address: 'Zona Franca Fontibón', city: 'Bogotá D.C.', department: 'Cundinamarca', taxRegime: 'RESPONSABLE_IVA', status: 'ACTIVE' },
    { id: 'cust_006', tenantId, documentType: 'CC', documentNumber: '80123456', personType: 'NATURAL', name: 'Andrés Felipe Arias Patiño', email: 'andres.arias@yahoo.es', phone: '3116543210', address: 'Calle 72 # 10-34', city: 'Bogotá D.C.', department: 'Cundinamarca', taxRegime: 'NO_RESPONSABLE_IVA', status: 'ACTIVE' },
    { id: 'cust_007', tenantId, documentType: 'CC', documentNumber: '43987654', personType: 'NATURAL', name: 'Diana Marcela Londoño Cano', email: 'diana.londono@gmail.com', phone: '3149876543', address: 'Carrera 43A # 14-25', city: 'Medellín', department: 'Antioquia', taxRegime: 'NO_RESPONSABLE_IVA', status: 'ACTIVE' },
    { id: 'cust_008', tenantId, documentType: 'NIT', documentNumber: '890102030-4', personType: 'JURIDICA', name: 'Comercializadora El Dorado S.A.', email: 'facturacion@eldorado.co', phone: '6053501122', address: 'Calle 84 # 52-10', city: 'Barranquilla', department: 'Atlántico', taxRegime: 'RESPONSABLE_IVA', status: 'ACTIVE' },
    { id: 'cust_009', tenantId, documentType: 'CC', documentNumber: '1098765432', personType: 'NATURAL', name: 'Gustavo Adolfo Martínez Torres', email: 'tavo.martinez@hotmail.com', phone: '3173334455', address: 'Carrera 27 # 36-15', city: 'Bucaramanga', department: 'Santander', taxRegime: 'NO_RESPONSABLE_IVA', status: 'ACTIVE' },
    { id: 'cust_010', tenantId, documentType: 'CC', documentNumber: '31456789', personType: 'NATURAL', name: 'Esperanza Valencia de Zuluaga', email: 'esperanza.valencia@gmail.com', phone: '3187778899', address: 'Avenida Circunvalar # 12-40', city: 'Pereira', department: 'Risaralda', taxRegime: 'NO_RESPONSABLE_IVA', status: 'ACTIVE' },
  ]

  for (const c of customersData) {
    const existing = await db.select().from(schema.customer).where(eq(schema.customer.id, c.id))
    if (!existing.length) {
      await db.insert(schema.customer).values({ ...c, createdAt: new Date(), updatedAt: new Date() })
    }
  }
  console.log('✅ 10 Clientes registrados en el sistema')

  // 5. Categorías de productos (product_category)
  const categoriesData = [
    { name: 'Lácteos', color: '#3B82F6' },
    { name: 'Café y Chocolate', color: '#A16207' },
    { name: 'Confitería y Snacks', color: '#EF4444' },
    { name: 'Bebidas', color: '#06B6D4' },
    { name: 'Aseo del Hogar', color: '#22C55E' },
    { name: 'Cuidado Personal', color: '#8B5CF6' },
  ]

  const seedSlug = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

  const categoryIdByName = new Map<string, string>()
  for (const [i, c] of categoriesData.entries()) {
    const id = `cat_seed_${String(i + 1).padStart(2, '0')}`
    categoryIdByName.set(c.name, id)
    const existing = await db.select().from(schema.productCategory).where(eq(schema.productCategory.id, id))
    if (!existing.length) {
      await db.insert(schema.productCategory).values({
        id,
        tenantId,
        name: c.name,
        slug: seedSlug(c.name),
        description: `Categoría ${c.name}`,
        color: c.color,
        icon: null,
        productCount: 0,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }
  }
  console.log(`✅ ${categoriesData.length} Categorías de productos registradas`)

  // 6. Generación Dinámica de 100 Productos con FOR Loop
  console.log('⚡ Generando catálogo de 100 productos mediante FOR loop...')

  const productTemplates = [
    { prefix: 'Leche Entera', unitPrice: 4800, cost: 3400, ivaRate: '0.00', category: 'Lácteos' },
    { prefix: 'Queso Campesino', unitPrice: 13500, cost: 9500, ivaRate: '0.00', category: 'Lácteos' },
    { prefix: 'Mantequilla con Sal', unitPrice: 8900, cost: 6200, ivaRate: '5.00', category: 'Lácteos' },
    { prefix: 'Yogurt Vaso Fresa', unitPrice: 3200, cost: 2100, ivaRate: '5.00', category: 'Lácteos' },
    { prefix: 'Café Molido Gourmet', unitPrice: 19500, cost: 14200, ivaRate: '5.00', category: 'Café y Chocolate' },
    { prefix: 'Chocolate en Pastilla', unitPrice: 7600, cost: 5100, ivaRate: '5.00', category: 'Café y Chocolate' },
    { prefix: 'Chocolatina Tradicional', unitPrice: 2200, cost: 1400, ivaRate: '19.00', category: 'Confitería y Snacks' },
    { prefix: 'Galletas Rellenas Fresa', unitPrice: 4500, cost: 3000, ivaRate: '19.00', category: 'Confitería y Snacks' },
    { prefix: 'Papas Fritas Natural', unitPrice: 3800, cost: 2500, ivaRate: '19.00', category: 'Confitería y Snacks' },
    { prefix: 'Gaseosa Cola 1.5L', unitPrice: 5600, cost: 3800, ivaRate: '19.00', category: 'Bebidas' },
    { prefix: 'Agua Mineral Sin Gas 600ml', unitPrice: 2000, cost: 1100, ivaRate: '19.00', category: 'Bebidas' },
    { prefix: 'Jugo Néctar Durazno 1L', unitPrice: 4900, cost: 3300, ivaRate: '19.00', category: 'Bebidas' },
    { prefix: 'Cerveza Lata 330ml', unitPrice: 3500, cost: 2400, ivaRate: '19.00', category: 'Bebidas' },
    { prefix: 'Bebida de Malta 300ml', unitPrice: 2800, cost: 1800, ivaRate: '19.00', category: 'Bebidas' },
    { prefix: 'Detergente Polvo Multiusos 1kg', unitPrice: 14800, cost: 10200, ivaRate: '19.00', category: 'Aseo del Hogar' },
    { prefix: 'Jabón de Loza Líquido 500ml', unitPrice: 7900, cost: 5300, ivaRate: '19.00', category: 'Aseo del Hogar' },
    { prefix: 'Suavizante Textil 1000ml', unitPrice: 11200, cost: 7800, ivaRate: '19.00', category: 'Aseo del Hogar' },
    { prefix: 'Limpiador Multiusos Lavanda', unitPrice: 6500, cost: 4300, ivaRate: '19.00', category: 'Aseo del Hogar' },
    { prefix: 'Shampoo Cuidado Diario 400ml', unitPrice: 18900, cost: 13200, ivaRate: '19.00', category: 'Cuidado Personal' },
    { prefix: 'Crema Dental Triple Acción 100g', unitPrice: 8500, cost: 5800, ivaRate: '19.00', category: 'Cuidado Personal' },
  ]

  const brands = ['Alquería', 'Nutresa', 'Bavaria', 'P&G', 'Postobón', 'Colombina', 'Alpina', 'Unilever', 'Nacional', 'Nestlé']
  const presentations = ['250g', '500g', '1000g', '1L', '1.5L', 'Pack x6', 'Pack x12', 'Unidad']

  const productsToInsert = []

  for (let i = 1; i <= 100; i++) {
    const template = productTemplates[(i - 1) % productTemplates.length]
    const brand = brands[(i - 1) % brands.length]
    const presentation = presentations[(i - 1) % presentations.length]

    const skuNum = i.toString().padStart(3, '0')
    const barcodeNum = (7702000000000 + i * 137).toString()

    const itemPrice = template.unitPrice + (i % 5) * 500
    const itemCost = Math.round(itemPrice * 0.7)

    productsToInsert.push({
      id: `prod_${skuNum}`,
      tenantId,
      sku: `SKU-${brand.substring(0, 3).toUpperCase()}-${skuNum}`,
      barcode: barcodeNum,
      name: `${template.prefix} ${brand} ${presentation}`,
      description: `${template.prefix} marca ${brand} en presentación ${presentation}. Calidad garantizada.`,
      unitPrice: itemPrice.toFixed(2),
      cost: itemCost.toFixed(2),
      ivaRate: template.ivaRate,
      category: template.category || 'General',
      categoryId: categoryIdByName.get(template.category) || null,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  // Bulk Insert de los 100 Productos (crea o actualiza categoría)
  for (const p of productsToInsert) {
    const existing = await db.select().from(schema.product).where(eq(schema.product.id, p.id))
    if (!existing.length) {
      await db.insert(schema.product).values(p)
    } else {
      await db
        .update(schema.product)
        .set({ category: p.category, categoryId: p.categoryId, updatedAt: new Date() })
        .where(eq(schema.product.id, p.id))
    }
  }
  console.log('✅ 100 Productos retail generados e insertados en la base de datos')

  // Actualizar el conteo de productos por categoría
  const categoryCounts = new Map<string, number>()
  for (const p of productsToInsert) {
    categoryCounts.set(p.category, (categoryCounts.get(p.category) || 0) + 1)
  }
  for (const [name, count] of categoryCounts) {
    const catId = categoryIdByName.get(name)
    if (catId) {
      await db
        .update(schema.productCategory)
        .set({ productCount: count, updatedAt: new Date() })
        .where(eq(schema.productCategory.id, catId))
    }
  }

  // 6. Generación de Inventario para los 100 Productos en las 3 Sucursales (300 Registros)
  let stockCount = 0
  for (const loc of locationsData) {
    for (const p of productsToInsert) {
      const invId = `inv_${loc.id}_${p.id}`
      const existing = await db.select().from(schema.inventory).where(eq(schema.inventory.id, invId))

      const baseQty = 80 + (stockCount % 120)
      const reserved = 5 + (stockCount % 10)
      const available = baseQty - reserved

      if (!existing.length) {
        await db.insert(schema.inventory).values({
          id: invId,
          tenantId,
          locationId: loc.id,
          productId: p.id,
          quantity: baseQty.toFixed(2),
          reserved: reserved.toFixed(2),
          available: available.toFixed(2),
          reorderPoint: '15.00',
          updatedAt: new Date(),
        })
        stockCount++
      }
    }
  }
  console.log(`✅ ${stockCount} Registros de inventario creados (100 productos x 3 sucursales)`)

  // 7. Numeración Fiscal DIAN
  const resolutionsData = [
    {
      id: 'num_pos_001',
      tenantId,
      resolution: '18764000001',
      prefix: 'SETP',
      startRange: 1,
      endRange: 500000,
      currentNumber: 105,
      documentType: 'DOCUMENTO_EQUIVALENTE_POS',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'num_fe_001',
      tenantId,
      resolution: '18764000002',
      prefix: 'SETP',
      startRange: 1,
      endRange: 100000,
      currentNumber: 24,
      documentType: 'FACTURA_ELECTRONICA_VENTA',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  for (const num of resolutionsData) {
    const existing = await db.select().from(schema.numeration).where(eq(schema.numeration.id, num.id))
    if (!existing.length) {
      await db.insert(schema.numeration).values(num)
    }
  }
  console.log('✅ 2 Resoluciones fiscales DIAN activas')

  console.log('🎉 SEED COMPLETO COMPLETADO CON ÉXITO.')
  console.log('----------------------------------------------------')
  console.log('📊 RESUMEN BASE DE DATOS POSTGRESQL:')
  console.log('   - Tenant: 1 (Comercializadora POS Retail S.A.S.)')
  console.log('   - Sucursales: 3 (Bogotá, Medellín, Cali)')
  console.log('   - Proveedores: 10 Empresas Mayoristas')
  console.log('   - Clientes: 10 Clientes Frecuentes')
  console.log('   - Categorías: 6')
  console.log('   - Productos: 100 Ítems Catálogo Retail')
  console.log('   - Inventarios: 300 Registros de Stock')
  console.log('----------------------------------------------------')
  console.log('🔐 CUENTA DE ACCESO CREADA:')
  console.log('   - URL Login: http://localhost:3000/login')
  console.log('   - Admin: gersongio0527@gmail.com (rota la contraseña por un canal seguro)')
  console.log('   - Panel de Administración Multi-Tenant: /dashboard/users (Pestaña "Empresas / SAS")')
  console.log('----------------------------------------------------')
}

if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error ejecutando seed:', err)
      process.exit(1)
    })
}
