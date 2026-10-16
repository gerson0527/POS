# PLAN DE REFACTORIZACIÓN Y COMPONENTIZACIÓN — pos-retail-y-dian

> **Documento de análisis (READ-NO-EDIT).** Auditoría completa del proyecto realizada sin modificar ningún archivo de código. Contiene: código muerto a eliminar, patrones a componentizar, archivos a dividir, hallazgos de seguridad y un plan de acción priorizado.
>
> Fecha: 2026-10-15 · Alcance: `app/`, `components/`, `hooks/`, `lib/`, `scripts/`, `packages/`, carpetas raíz y configuración.

---

## 1. RESUMEN EJECUTIVO

### Métricas actuales

| Métrica | Valor |
|---|---|
| Archivo más grande | `app/actions/pos-actions.ts` — **~3.500 líneas** con ~90 funciones exportadas |
| Archivos > 800 líneas | **7** (actions + 6 páginas del dashboard) |
| Líneas de `app/dashboard/**` | ~11.200 TSX |
| Modales `fixed inset-0` escritos a mano | **23** en 7 páginas (18 con clases idénticas) |
| `alert()` / `confirm()` nativos | **44 + 3** en 9 páginas |
| Copias de `showToast()` | **8** (7 idénticas + 1 con timeout distinto) |
| Tablas HTML reimplementadas | **15 tablas / 5 variantes** en 10 páginas |
| Empty-States `[NO HAY …]` duplicados | **16+** |
| Clases de `<input>` repetidas | **~90** (4+ variantes) |
| Clases de `<label>` repetidas | **~73** |
| Server Components en dashboard | **2 de 16** (todo es `'use client'`) |
| Código muerto identificado | **~3.000+ líneas** (acciones + componentes + carpetas enteras) |
| Doble lockfile | `package-lock.json` + `pnpm-lock.yaml` + `pnpm-workspace.yaml` inválido |
| Verificación de tipos | `ignoreBuildErrors: true` → **cero validación en build**; `npm run lint` roto (sin ESLint); no hay script `test` |

### Los 10 problemas de mayor impacto

1. **`pos-actions.ts` (3.500 líneas)** es el problema estructural #1: 13 dominios mezclados en un solo archivo (productos, categorías, ventas, clientes, crédito, caja, facturación, tenants, usuarios…).
2. **Código muerto enorme**: `inventory-actions.ts` (365) + `credit-debit-actions.ts` (255) + `dian-dashboard.tsx` (273) sin **ningún** importador; carpetas `apps/`, `libs/`, `test/` completas sin uso; ~55 imports sin usar en páginas.
3. **23 modales duplicados a mano** — no existe componente `Modal`, ni `Escape`, ni `aria-modal`, ni focus-trap. Además **22 modales no llevan `no-print`** → bug real: imprimir desde un modal tapa el recibo con el overlay.
4. **8 `showToast` + 44 `alert()` nativos** sin librería de toasts instalada (`sonner` no está).
5. **N+1 queries en `getAllInvoices`**: 2 queries **por venta** (pagos + ítems) → 1.001 ventas = 2.001 queries.
6. **`lib/dian/` es un 90 % de código muerto/estub**: `soap-client.ts:105-117` *simula* aceptaciones DIAN (`status: 'ACCEPTED'` con `setTimeout`), solo importado por stats.
7. **Fuga de credenciales por logs**: `factus.ts:172-175` loguea `client_id`, prefijo de `client_secret` y de `password` (confirmado en `dev.log:126-135`).
8. **Aislamiento de tenants roto en 2 actions**: `credit-debit-actions.getTenantId()` devuelve `userId.slice(0,8)` como tenantId; `getTenantId()` de `pos-actions` **auto-crea membresía ADMIN** si no existe (escalada).
9. **Tres copias divergentes del esquema**: `schema.ts` (811) vs `init.ts` (551) vs `tenant-provisioner.ts` (509) — con drift demostrado (decimales, defaults, columnas distintas). `init.ts` corre en **cada arranque**.
10. **Tres modelos fiscales paralelos**: legacy `invoice`/`invoiceNumber`/`numeration` vs `fiscalDocument` (Factus) vs 3 fórmulas de CUFE distintas.

---

## 2. 🚨 HALLAZGOS CRÍTICOS (seguridad/correctividad) — arreglar antes de refactorizar

| # | Hallazgo | Ubicación | Acción |
|---|---|---|---|
| S1 | Log con credenciales parciales (client_id, secret, password) | `lib/invoicing/factus.ts:172-175` (+ evidencia en `dev.log:126-135`) | Eliminar/redactar el log; borrar `dev.log` |
| S2 | `getTenantId()` crea membresía **ADMIN** por defecto en `tenant_default` | `app/actions/pos-actions.ts:34-53` | Separar en `getTenantId()` (lectura) + `ensureMembership()` con rol correcto; fallar si no hay vínculo |
| S3 | `getTenantId()` = `session.user.id.slice(0,8)` → aislamiento roto | `app/actions/credit-debit-actions.ts:18-23` | Corregir o eliminar (ver código muerto) |
| S4 | `tenantId = 'default-tenant'` hardcodeado | `app/api/inventory/purchase-orders/route.ts:13` | Resolver tenant real desde sesión |
| S5 | PDF con marca blanca controlada por el cliente (nombre/NIT/ítems del body) | `app/api/reports/inventory-pdf/route.ts:13-26` | Tomar empresa/tenant del servidor |
| S6 | Rutas API devuelven `details: error.message` (filtro de info interna) | `app/api/dian/queue-stats/route.ts:25`, `app/api/dian/status/route.ts:67` | Respuesta genérica + log server-side |
| S7 | Ruta `dian/submit` devuelve `success:true, status:'SENT_DIAN'` **sin enviar nada** | `app/api/dian/submit/route.ts:61-66` | Eliminar o conectar a `emitElectronicInvoice` |
| S8 | `.env` commiteable (`.gitignore` solo cubre `.env*.local`) con `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` | raíz | Añadir `.env` y `*.log` a `.gitignore` |
| S9 | Fallbacks hardcodeados de secretos | `lib/auth.ts:7`, `lib/security/encrypt.ts:25,31-32`, `scripts/seed.ts:36` | `requireEnv()` en producción, sin fallbacks |
| S10 | `seed.ts` imprime contraseñas en consola | `scripts/seed.ts:52,318-319` | Quitar logs de credenciales |
| S11 | `ignoreBuildErrors: true` enmascara errores reales (p. ej. `tenant-context.ts` importa un módulo inexistente) | `next.config.mjs:4-6` | Limpiar errores y quitar el flag |
| S12 | `credit-debit-actions` y rutas legacy usan CUFE con inputs hardcodeados `'TEST_KEY'` | `pos-actions.ts:1063-1065` | Unificar CUFE real o eliminar ruta legacy |

---

## 3. 🗑️ CÓDIGO MUERTO A ELIMINAR

### 3.1 Archivos enteros sin ningún consumidor

| Archivo | Líneas | Verificación |
|---|---|---|
| `app/actions/inventory-actions.ts` | 365 | 0 imports; **duplica** funciones de `pos-actions.ts` (suppliers, PO, movements). Migrar solo los 4 métodos que faltan (`receivePurchaseOrderItem`, `getStockAlerts`, `acknowledgeStockAlert`, `checkAndCreateStockAlerts`) |
| `app/actions/credit-debit-actions.ts` | 255 | 0 imports (además roto: ver S3) |
| `components/dian-dashboard.tsx` | 273 | 0 imports; arrastra en cascada `getDIANInvoices` y la ruta `api/dian/queue-stats` |
| `components/ui/button.tsx` | 58 | 0 consumidores; arrastra `cn()`, `cva`, `@base-ui/react` |
| `lib/db/tenant-context.ts` | 35 | Importa `@/lib/actions/pos-actions-helpers` (**no existe**); nadie lo importa |
| `lib/api/webhook-service.ts` | 111 | 0 consumidores externos |
| `lib/dian/*` (`xml-generator`, `signature-service`, `config`, `index`, `soap-client`) | ~580 | Solo `queue-service` (semi-vivo) y una ruta de stats; el resto es stub/simulado |
| `lib/reports/invoice-pdf-generator.ts` | 285 | 0 imports y **roto** (importa `qrcode`, que no está en `package.json`) |
| `lib/reports/pdf-generator.ts` → `generatePurchaseOrderPDF` | ~98 | 0 imports |
| `app/dashboard/api/page.tsx` | 219 | Ruta huérfana (sin enlace en sidebar), **datos 100 % mockeados**, paleta ajena al tema |
| `apps/` (6 archivos NestJS) | — | Sin `main.ts`/package.json; 0 referencias |
| `libs/` (26 archivos DDD/NestJS/Prisma) | — | Solo los consume `test/` (que no corre) |
| `test/` (2 specs Jest) | — | Sin Jest/Vitest ni script `test` |
| `packages/fiscal-dian`, `packages/hardware-sdk` | — | 0 consumidores en runtime |
| `packages/*/dist/` | — | Los imports van a `src/`; build committed |
| ~22 scripts `debug_*`/`fix_*`/`test_*` en `scripts/` | — | ~17 rotos (requieren módulos inexistentes/ESM) → `scripts/archive/` |
| `dev.log`, `scratch_reset.js`, `test_pg.js`, `tsconfig.tsbuildinfo` | — | Artefactos de debugging |
| `prisma/` + deps `prisma`/`@prisma/client` | — | La app usa Drizzle; Prisma solo consumían `apps/`/`libs/` muertos |
| Deps sin uso | — | `@vercel/analytics`, `html2pdf`, `jszip`, `rxjs`, `xml2js`, `winston`, `@nestjs/*`, `@types/express`, `@types/jest`, `soap`, `xmldsig`, `node-forge`, `redis` (el código usa `ioredis`) |

### 3.2 Exports muertos en `pos-actions.ts`

`getLocations` (:682), `searchCustomers` (:1178), `getCustomerByDocument` (:1160, importado pero nunca llamado), `getDIANInvoices` (:1782), `INVOICING_CONSTANTS` (`lib/invoicing/index.ts:152`), `ENV_KEYS_PUBLIC` (`env-config.ts:89`), `createAPIKey` (`lib/api/public-api.ts:12`).

### 3.3 Rutas huérfanas / redundantes

- `app/dashboard/cash-closure/page.tsx` (3 líneas) — re-export de la página de caja; crea 2ª ruta que **remonta** la vista. Eliminar → redirect.
- `app/dashboard/pos-terminal/page.tsx` (267) — sin enlaces internos, con datos hardcodeados (`tenant_bogota_01`, carrito demo); es el **único** consumidor de los 4 `hooks/` y de 5 `packages/`. **Decisión requerida:** ¿conservar la arquitectura híbrida Tauri o es un spike desechable?
- `app/dashboard/dian/page.tsx` (32) — placeholder "deshabilitado".
- `app/api/dian/submit-invoice` vs `submit` — dos stubs redundantes.
- `/sign-in` y `/sign-up` — redoble de redirect a `/login`.

---

## 4. 🧩 PATRONES A COMPONENTIZAR (con evidencia)

### 4.1 Componentes a crear en `components/tactical/` (o `components/ui/`)

| Prioridad | Componente | Evidencia de duplicación | Ahorro estimado |
|---|---|---|---|
| **P0** | `Modal.tsx` (props: `open, onClose, title, icon, tone, size`; incluye `Escape`, `aria-modal`, focus-trap, `no-print` en el overlay) | 23 modales en 7 páginas; 18 overlays con clases idénticas `fixed inset-0 bg-black/80 backdrop-blur-sm z-50…` | **~600–900 líneas** + corrige bug de impresión desde modal |
| **P0** | `ToastProvider` + `useToast()` (o instalar `sonner`) | 8 estados locales, 7 `showToast()` idénticas (una con 3000 ms vs 4000), 2 estilos de toast distintos | ~350 líneas |
| **P0** | `ConfirmDialog.tsx` (`variant="danger"`, `extraContent` p.ej. select de reasignación de categorías) | 3 `confirm()` nativos + modales de borrado ad-hoc en `categories:489` y `customers:800` | ~250 líneas |
| **P0** | `DataTable.tsx` (columnas tipadas, header, empty, loading, slot acciones, `searchable`, integrado a `usePagination`) | 15 tablas en 10 páginas con 5 variantes de clase; lógica `paginatedXxx` reimplementada en 7 páginas | **~1.500–2.000 líneas** |
| **P1** | `EmptyState.tsx` (variantes `row` con `colSpan` y `panel`) | 16+ copias de `[NO HAY …]` | ~150 |
| **P1** | `FormField` / `Input` / `Select` / `TextArea` / `Label` | ~90 inputs + ~73 labels con 4+ variantes; además `globals.css:81-94` ya estiliza inputs globalmente → las clases `bg-[#0E0E0E] border…` son redundantes | ~400 |
| **P1** | `SearchInput.tsx` | 6 buscadores con lupa `pl-9 uppercase` idénticos | ~80 |
| **P1** | `Tabs.tsx` | 4–6 páginas con patrón manual + 2 duplicados internos en `inventory` | ~150 |
| **P2** | `PageHeader.tsx` (icono + kicker naranja + h1 + descripción + acciones) | 10 repeticiones exactas del patrón `flex … bg-[#171717] border border-[#303030] rounded-[6px] p-6` | ~200 |
| **P2** | `hooks/usePagination.ts` | 7 páginas cortando arrays a mano | ~120 |
| **P2** | `Spinner` / `Skeleton` | decenas de "Cargando…" sueltos | ~100 |
| **P2** | `components/print/` — `PrintableTicket.tsx` + `TicketHeader.tsx` | Comprobante factura (`invoices:723-993`) y Reporte Z (`cashier`) comparten cabecera NIT, tabla ítems, totales, pie, `window.print()` | ~180 |

### 4.2 Componentes de dominio a extraer (fusionar duplicados)

| Componente | Ubicación actual | Nota |
|---|---|---|
| `components/inventory/ProductFormModal.tsx` (`mode: 'create'|'edit'`) | `inventory/page.tsx:1107-1427` (crear) y `:1429-1729` (editar) | **~620 líneas duplicadas al 90 %**; misma tabulación general/pricing/taxonomy, misma fórmula de margen 4 veces → ahorro neto ~300 |
| `components/customers/CustomerFormModal.tsx` (prop `compact`) | `customers/page.tsx:608-798` + alta rápida en `pos/page.tsx:792-845` | Mismos campos NIT/nombre/teléfono |
| `components/inventory/*Modal.tsx` (Movement, Supplier, PurchaseOrder, ImportCsv) | `inventory/page.tsx` | Ver §6 división |
| Eliminar `KpiCard` (`dashboard:583`) y `StatCard` (`customers:982`) | — | Unificar en `MetricCard` existente (extendiendo acentos) — hoy hay 4 implementaciones compitiendo |

### 4.3 Hooks a crear

| Hook | Problema que resuelve |
|---|---|
| `hooks/useProtectedQuery.ts` | 9 copias de `loadData()` con `err?.message?.includes('UNAUTHORIZED')` frágil; 4 páginas redirigen a `/sign-in`, **7 no manejan sesión expirada**. Requiere error tipado `UnauthorizedError` o `{ok:false, code}` en actions |
| `hooks/usePagination.ts` | 7 reimplementaciones |
| `useToast()` | ver §4.1 |

---

## 5. 🔧 REFACTORIZACIÓN DE `app/actions/` (el objetivo principal)

### 5.1 Partición propuesta de `pos-actions.ts` (~3.500 líneas → 17 archivos, máx. ~450 c/u)

```
app/actions/
├── _shared/
│   ├── session.ts        # getUserId, getTenantId, getCurrentTenantIdSafe  (~60)
│   ├── audit.ts          # logAudit, publishEvent                          (~40)
│   ├── csv.ts            # escapeCsv, parseCsvLine, parseCsv               (~55)
│   ├── formatters.ts     # formatBogotaDateTime, mapFiscalStatus, slugify  (~50)
│   └── errors.ts         # error estándar UNAUTHORIZED (tipado, no por string)
├── products.ts           # CRUD + import/export CSV                        (~440)
├── categories.ts         #                                              (~165)
├── locations.ts          #                                              (~85)
├── sales.ts              # createSale/completeSale/getSale/generateInvoice (~450)
├── invoices.ts           # getAllInvoices + emitFactus + config Factus     (~360)
├── customers.ts          # CRUD clientes                                  (~230)
├── credit.ts             # charge/pay/detail/limit/overdue                (~270)
├── inventory.ts          # suppliers + PO + movements (fusiona lo válido de inventory-actions.ts) (~400)
├── cashier-sessions.ts   # + buildSessionZReportData                      (~375)
├── reports.ts            # getSalesReports, getInventoryStats, telemetry   (~185)
├── company.ts            # companyInfo + factus config                    (~210)
├── onboarding.ts         #                                              (~120)
├── numerations.ts        #                                              (~90)
├── users.ts              #                                              (~90)
├── tenants.ts            # createTenantWithAdmin + listAllTenants         (~235)
└── index.ts              # barrel: export * from './…'
```

**Estrategia sin romper imports:** mantener `app/actions/pos-actions.ts` como `export * from './index'` de 5 líneas → los 13 consumidores existentes siguen funcionando sin tocar páginas.

### 5.2 Partes de `pos-actions.ts` que requieren rediseño (no solo mover código)

- **`getAllInvoices` (:3188-3321) — N+1**: reemplazar el bucle por 1 query de pagos + 1 de ítems con `inArray(saleId, ids)`.
- **`buildSessionZReportData` (:3002, 186 líneas)** → `cashier/z-report.ts` con tipo de retorno explícito (hoy `any`).
- **`createTenantWithAdmin` (:2584, 172 líneas)** → `provisionTenant()` + `seedDefaultNumerations()` + `sendWelcomeEmail()`.
- **`getTenantId`** con efecto colateral de escritura → separar lectura/escritura (ver S2).
- **`emitFactusElectronicInvoice` (:3334-3425)** → mover lógica de dominio a `lib/invoicing/emit-invoice.ts`; el action queda como `requireSession()` + llamada + mapeo UI.
- **`generateInvoice` (:997-1103)** — ruta legacy con CUFE `'TEST_KEY'` y tablas `invoice`/`invoiceNumber`: **marcar deprecated** y redirigir a Factus.
- **Falta `server-only`** en ningún archivo de actions → riesgo de que `lib/db` entre al bundle cliente.

---

## 6. 📄 REFACTORIZACIÓN DE PÁGINAS (división de archivos > 800 líneas)

| Archivo | Líneas | Propuesta |
|---|---|---|
| `inventory/page.tsx` | ~2.130 | `InventoryClient` + `ProductFormModal` (fusiona crear/editar) + `Movement/Supplier/PurchaseOrder/ImportCsv` modals + 4 tablas + `useInventoryData` → **12 archivos** |
| `settings/page.tsx` | ~1.220 | Secciones: `Company`, `FactusConfig`, `Locations`, `Numerations` + 2 modales → **8 archivos** |
| `pos/page.tsx` | ~1.160 | `ProductGrid`, `CartPanel`, `CustomerPicker`, `PaymentModal`, `TotalsBreakdown` + modales de confirmación + `hooks/useCart` → **11 archivos** |
| `users/page.tsx` | ~1.030 | Tabs Companies/Operators + `CreateTenantWizard` (412 líneas → `steps/` + `Stepper`) → **10 archivos** |
| `customers/page.tsx` | ~960 | `CustomerTable`, `CustomerFormModal`, `CreditDetailModal`, `useCustomers` → **8 archivos** |
| `invoices/page.tsx` | ~930 | `InvoiceTable`, `XmlAuditModal`, `InvoiceTicketModal`, mover `numeroALetras` a `lib/dian/amount-in-words.ts` → **6 archivos** |
| `cashier/page.tsx` | ~680 | `OpenSession` / `CloseSession` / `ZReport` modales → **5 archivos** |
| `reports/page.tsx` | ~672 | `DateRangePicker`, `SalesReportView`, mover 7 helpers de rango a `lib/utils/date-ranges.ts` → **5 archivos** |
| `dashboard/page.tsx` | ~640 | Extraer KPIs a server action `getDashboardSummary()` (hoy consulta Drizzle directo en el componente) + `ModulesGrid` → **4 archivos** |

### 6.1 Migración a Server Components (orden de ROI)

1. **`dashboard/layout.tsx` hoy es `'use client'`** → mover a Server Component el shell (sesión, `isMasterAdmin`) y dejar cliente solo el menú móvil/reloj.
2. **Guard de onboarding corre una query en CADA navegación** (`layout.tsx:55-73`, dependencias `[pathname, router]`) → hacerlo en el Server Component del layout o cachear.
3. Páginas CRUD candidatas a Server + `revalidatePath`: `settings`, `users`, `customers`, `categories`, `invoices`. `pos` y `cashier` se quedan cliente con datos iniciales vía `Suspense`.
4. Unificar guard: hoy conviven `middleware.ts` (cookie presence), checks ad-hoc en `dashboard/page.tsx` y nada en 13 páginas.
5. Unificar redirect de sesión: TODO a `/login` (eliminar `/sign-in`, `/sign-up`).

---

## 7. 🧱 REFACTORIZACIÓN DE `lib/`

### 7.1 `lib/invoicing/` (bien diseñado, mala ejecución)

- `factus.ts:151-235 authenticate()` (~85 líneas) → `factus-http.ts` (`requestFactusToken`, `parseOAuthError`, `TokenCache`).
- `factus.ts:279-392 sendInvoice()` (~114 líneas) → `factus-mappers.ts` (`toInvoiceResult`, `fetchBillLinks`); la clase queda como orquestador.
- Mappers estáticos puros (`factus.ts:18-148`) → exportar como funciones nominales + tests (`test/invoicing/factus-mappers.test.ts`).
- `build-bill.ts` → separar puro/impuro: `loadInvoiceContext(saleId)` (DB) + `buildCustomerPayload`/`buildItems`/`buildPayments`/`computeExactInvoiceTotal` **exportadas y testeables**; el compositor final tiene 10 líneas. **Romper la dependencia invertida** (`build-bill.ts:14` importa `FactusProvider` solo por sus mappers).
- Unificar credenciales: `updateTenantFactusConfig` (actions) e `index.ts` lector → `lib/invoicing/tenant-credentials.ts` (una sola fuente de cifrado + redacción).
- `getInvoiceProvider` consulta BD dos veces → pasar config como parámetro.
- Catálogos unificados: **métodos de pago** (3 vocabularios: `factus.ts:18-29`, `pos-actions:3252`, `pos:1014`) y **estados DIAN** (hoy en 4 sitios) → `lib/catalogs/payment-methods.ts` + `lib/catalogs/dian-status.ts`.
- **CUFE en 3 fórmulas distintas** (`pos-utils.ts:8-25`, `signature-service.ts:99`, `xml-generator.ts:60`) → un solo `lib/fiscal/cufe.ts` con tests de vectores oficiales.

### 7.2 `lib/db/`

- **Partir `schema.ts` (811)** en `schema/{auth,tenancy,catalog,customers,sales,purchasing,inventory,fiscal,platform}.ts` con re-export `index.ts` para no romper `import * as schema`. Consolidar `category` vs `productCategory` y el modelo fiscal legacy vs `fiscalDocument`.
- **Eliminar `init.ts` (551)** y migrar a **drizzle-kit**; hoy corre en cada arranque, traga errores (`catch` vacío) y divergió del schema (tabla de drift en el informe: decimales 12,2 vs 12,4, defaults `PENDING`/`COMPLETED`, columnas `audit_log` distintas entre `init`/`schema`/`provisioner`).
- **`tenant-provisioner.ts` (509)**: su SQL es la **3ª copia divergente** → reutilizar los mismos archivos de migración; extraer `lib/db/connection-string.ts` (construcción de masterUrl triplicada).
- `prisma/schema.prisma` + deps → eliminar (doble ORM).

### 7.3 `app/api/`

- **Política explícita**: server actions para UI, REST **solo** `/api/v1` para terceros → eliminar o reconvertir `/api/pos`, `/api/inventory`, `/api/dian` (la UI no las usa).
- Auth/tenant resuelto **5 formas distintas** → `lib/auth/session-context.ts` (`requireUser`, `requireTenantId`, `requireRole`) + `lib/api/http.ts` (`withAuth`, `jsonError`, `parseJsonBody`).
- **Validación**: no existe (`zod` ni siquiera está en `package.json`; `limit` sin clamp, `body.items` libre) → añadir `zod` + schemas por recurso.
- Errores: unificar estilos (`{success:false}` vs `throw`) en una clase `AppError`.

### 7.4 `lib/reports/` (PDF)

- Boilerplate Puppeteer **triplicado** (2 sin `--no-sandbox`, 2 con) y un Chrome nuevo por PDF → `lib/reports/render.ts` con `renderPdf()` + browser singleton.
- HTML por template literals **sin escape** → inyección HTML desde nombres de producto (`pdf-generator.ts:90-103`, `invoice-pdf-generator.ts:118-131`).
- **Fuente única del ticket**: hoy pantalla (JSX + `window.print()`) y PDF fiscal tienen layouts distintos → `components/print/Ticket.tsx` compartido.

---

## 8. 🎨 CSS Y SISTEMA DE DISEÑO

- **Tokens declarados y no consumidos**: `globals.css` define `--bg-panel`, `--border-subtle`, `--accent`… pero los TSX usan **~1.677 hexadecimales literales** (`#FF6A00` ×444, `#8C8C8C` ×386, `#303030` ×272…). Referencias a tokens: **3**.
- **Recomendación Tailwind v4**: migrar a bloque `@theme` (`--color-accent`, `--color-bg-panel`…) para generar `bg-panel`, `border-subtle`, `text-muted` automáticamente, y crear clases utilitarias: `.panel`, `.field-label`, `.input-tactical`, `.table-head`.
- **Bloque "Compatibility mapped tokens" duplicado** (`globals.css:33-50`) → unificar.
- Paleta divergente: `border-[#2A2A2A]` (50) vs `#303030` vs `#222…`; **6 grises de fondo sin token** (`#0b0b0b #101010 #121212 #141414 #171717 #0E0E0E`).
- `globals.css:81-94` estiliza globalmente `input, select, textarea` → las ~90 clases manuales `bg-[#0E0E0E] border focus:border-[#FF6A00]` **contradicen** el reset (`#0E0E0E` vs `#121212`) y son redundantes.
- Clases muertas: `.tracking-tactical` (0 usos); `.font-mono-tech` (1 uso); modo oscuro forzado permanente → el bloque `.dark` de shadcn y `components/ui/button.tsx` son media hoja inerte.
- `app/dashboard/api/page.tsx` usa paleta `slate/blue/emerald/purple` → sistema de diseño ajeno.
- **Bug en `@media print`**: `globals.css:163` usa `scroll-height` (propiedad inexistente) → eliminar.

---

## 9. 🛠️ TOOLCHAIN Y CONFIGURACIÓN

| Problema | Detalle | Acción |
|---|---|---|
| **Doble lockfile** | `package-lock.json` + `pnpm-lock.yaml` + `pnpm-workspace.yaml` inválido + `.npmrc` pnpm + bloque `pnpm` en package.json, pero Dockerfile/bats usan **npm** | Elegir npm → borrar pnpm-lock/workspace/.npmrc |
| **Cero verificación de tipos** | `ignoreBuildErrors: true` | Limpiar errores (incl. `tenant-context`, `env-config`, `scripts/seed`) y quitar el flag |
| **`npm run lint` roto** | No hay config ESLint ni dependencia | Añadir ESLint flat config o quitar el script |
| **Sin `test`** | `test/` existe pero sin runner; `@types/jest` huérfano | Instalar Vitest + script, o borrar `test/` |
| Sin script `typecheck` | — | Añadir `typecheck: tsc --noEmit` |
| `tsconfig` type-checkea código muerto | `include: ["**/*.ts"]` alcanza `apps/libs/packages/test/scripts` → por eso se necesita `ignoreBuildErrors` | `exclude: [apps, libs, packages, test, src-tauri]` |
| `.gitignore` incompleto | No ignora `.env`, `src-tauri/target/` (~113 MB), `*.tsbuildinfo`, `*.log` | Completarlo |
| `.dockerignore` sucio | No excluye `src-tauri/`, `test/`, `apps/`, `libs/`, `packages/*/dist` | Completarlo |
| `.env` divergente | Faltan 7 claves del ejemplo (SMTP/REDIS) | Alinear con `.env.example` |
| Deps en bloque equivocado | `shadcn` CLI en dependencies (solo para 1 import CSS), `@types/*` en dependencies | Reubicar |
| Doble stack ORM | `drizzle` (real) + `prisma` (huérfano) | Eliminar Prisma |
| Credenciales en UI de login | `login/page.tsx:172-197` muestra credenciales admin hardcodeadas | Mover a demo/entorno |

---

## 10. 📋 PLAN DE ACCIÓN PRIORIZADO

### Fase 0 — Crítico/seguridad (1 día, sin refactor)
1. Borrar `dev.log`; `.gitignore` → `.env`, `*.log`, `src-tauri/target/`, `*.tsbuildinfo`.
2. Redactar log de credenciales `factus.ts:172-175`.
3. Corregir `getTenantId` (auto-ADMIN) y `credit-debit-actions.getTenantId`; quitar `'default-tenant'`; corregir marca blanca de `inventory-pdf`.
4. Quitar `details: error.message` de las respuestas 500.
5. Añadir `no-print` a los 22 modales sin él + eliminar `scroll-height` inválida (bug de impresión).

### Fase 1 — Higiene / código muerto (2–3 días, riesgo bajo)
6. Borrar `inventory-actions.ts` (migrando los 4 métodos únicos), `credit-debit-actions.ts`, `dian-dashboard.tsx`, `ui/button.tsx`, `tenant-context.ts`, `webhook-service.ts`, `lib/dian/*` (decidiendo `queue-stats`), `invoice-pdf-generator.ts`, página `/api` mock.
7. Borrar carpetas `apps/`, `libs/`, `test/` (o `legacy/`), `packages/*/dist`, `packages/fiscal-dian`, `packages/hardware-sdk`; `scripts/archive/` para los ~22 scripts rotos.
8. Eliminar exports/imports muertos (~55 imports en 13 páginas + exports §3.2).
9. Decidir destino de `pos-terminal` + `hooks/` + `packages/` (conservar Tauri o eliminar spike).
10. Purgar deps sin uso; eliminar Prisma; elegir lockfile; añadir scripts `typecheck`.
11. Excluir carpetas muertas del `tsconfig`; objetivo: **quitar `ignoreBuildErrors`**.

### Fase 2 — Componentes base (1 semana, mayor ahorro visual)
12. `Modal.tsx` + migrar los 23 modales.
13. `ToastProvider`/`useToast` (o `sonner`) + `ConfirmDialog` → eliminar 8 `showToast`, 44 `alert()`, 3 `confirm()`.
14. `DataTable` + `EmptyState` + `usePagination` → migrar 15 tablas.
15. `FormField`/`Input`/`SearchInput`/`Tabs`/`PageHeader` → normalizar ~163 clases de formulario y 10 cabeceras.
16. Fusionar `ProductFormModal` crear/editar (−300) y `CustomerFormModal` (POS + clientes).
17. Unificar `MetricCard` (borrar `KpiCard`/`StatCard`).

### Fase 3 — Server Actions y datos (1–2 semanas)
18. Partir `pos-actions.ts` en dominios con barrel `index.ts` (§5.1) **sin tocar consumidores**.
19. Corregir N+1 de `getAllInvoices`; extraer `z-report.ts`, `session-context.ts`, `errors.ts` tipado.
20. Hook `useProtectedQuery` + unificación de redirects a `/login`.
21. `lib/catalogs/*` y `lib/utils/{format,date-ranges,slugify}` (eliminar `formatCOP` local de `cashier:101`).
22. `zod` + validación en rutas; `AppError` unificado.

### Fase 4 — Estructural (2–4 semanas)
23. Dividir páginas > 800 líneas (§6) y migrar CRUD a Server Components; layout a Server; guard de onboarding.
24. `lib/db`: split de `schema`, migración a **drizzle-kit**, eliminar `init.ts` y el SQL duplicado del provisioner; consolidar modelos fiscales (solo `fiscalDocument`) y una sola fórmula de CUFE.
25. `lib/invoicing`: `factus-http`/`factus-mappers` + tests; `emit-invoice.ts`; unificar credenciales.
26. PDF: `render.ts` con browser singleton + escape HTML + ticket único compartido (pantalla = PDF).
27. Migrar tokens a `@theme` de Tailwind v4 y sustituir los ~1.677 hex literales.

---

## 11. IMPACTO ESTIMADO

| Métrica | Antes | Después (objetivo) |
|---|---|---|
| Archivo más grande | ~3.500 líneas | ~450 líneas |
| Archivos > 800 líneas | 7 | 0 |
| Líneas muertas eliminadas | — | **~3.000+** |
| Modales escritos a mano | 23 | 1 componente |
| `showToast` / `alert` nativos | 8 / 44 | 1 hook / 0 |
| Tablas reimplementadas | 15 | 1 `DataTable` |
| Server Components dashboard | 2/16 | ~9/16 |
| Queries `getAllInvoices` | 1 + 2×N | 3 |
| Verificación de tipos | desactivada | activa (sin `ignoreBuildErrors`) |

---

*Documento generado por auditoría estática (3 exploraciones paralelas). No se modificó ningún archivo de código al elaborarlo.*
