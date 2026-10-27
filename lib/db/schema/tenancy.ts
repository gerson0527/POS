import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
  unique } from 'drizzle-orm/pg-core'

// --- POS System Tables -----------------------------------------------------

// TENANT: Multi-tenant isolation.
// Cada tenant debe tener su propia base de datos física:
//   - Web dev (Postgres): database = pos_tenant_<slug>
//   - Tauri (SQLite): archivo = <data_dir>/tenants/<id>.db
export const tenant = pgTable(
  'tenant',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    nit: text('nit').notNull().unique(),
    legalName: text('legalName').notNull(),
    tradeName: text('tradeName'),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    city: text('city'),
    department: text('department'),
    country: text('country').default('Colombia'),
    legalRepresentative: text('legalRepresentative'),
    legalRepDocNumber: text('legalRepDocNumber'),
    economicActivity: text('economicActivity'),
    website: text('website'),
    logoUrl: text('logoUrl'),
    // Identificador físico de la BD del tenant (slug único)
    dbSlug: text('dbSlug').notNull().default('default'),
    dbProvisioned: text('dbProvisioned').notNull().default('NO'), // SI | NO
    dbLastSyncAt: timestamp('dbLastSyncAt'),
    // Onboarding de primera vez
    onboardingCompleted: text('onboardingCompleted').notNull().default('NO'),
    onboardingCompletedAt: timestamp('onboardingCompletedAt'),
    onboardingCompletedBy: text('onboardingCompletedBy'),
    certificateThumbprint: text('certificateThumbprint'),
    dianSoftwareId: text('dianSoftwareId'),
    dianSoftwarePin: text('dianSoftwarePin'),
    dianUsername: text('dianUsername'),
    dianPassword: text('dianPassword'),
    dianTestSetId: text('dianTestSetId'),
    dianEnvironment: text('dianEnvironment'),
    factusClientId: text('factusClientId'),
    factusClientSecret: text('factusClientSecret'),
    factusUsername: text('factusUsername'),
    factusPassword: text('factusPassword'),
    factusEnvironment: text('factusEnvironment').default('sandbox'),
    factusNumberingRangeId: integer('factusNumberingRangeId'),
    // AUTO: el POS transmite la factura a la DIAN al completar la venta.
    // MANUAL: la venta queda PENDIENTE y la contadora (rol ACCOUNTANT) revisa
    // el IVA y transmite la factura desde /dashboard/invoices.
    dianTransmissionMode: text('dianTransmissionMode').notNull().default('AUTO'),
    // Datos fiscales del emisor usados en el payload de Factus/DIAN.
    // municipalityCode: código DANE del municipio (5 dígitos).
    // tributeCode: 'ZZ' = no aplica, '01' = IVA, etc.
    fiscalMunicipalityCode: text('fiscalMunicipalityCode').default('11001'),
    fiscalTributeCode: text('fiscalTributeCode').default('ZZ'),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE, SUSPENDED, INACTIVE
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    nitIdx: index('tenant_nit_idx').on(table.nit),
  })
)

// USER_TENANT: Link users to tenants + roles
export const userTenant = pgTable(
  'user_tenant',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    tenantId: text('tenantId').notNull(),
    role: text('role').notNull(), // ADMIN, CASHIER, MANAGER, VIEWER
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    uniq: unique('user_tenant_unique').on(table.userId, table.tenantId),
  })
)

// LOCATION: Sucursales/sedes
export const location = pgTable(
  'location',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenantId').notNull(),
    name: text('name').notNull(),
    code: text('code').notNull(),
    address: text('address'),
    city: text('city'),
    phone: text('phone'),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index('location_tenant_idx').on(table.tenantId),
    codeIdx: index('location_code_idx').on(table.tenantId, table.code),
  })
)
