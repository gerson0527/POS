# ARQUITECTURA: SISTEMA POS CON FACTURACIÓN ELECTRÓNICA DIAN (COLOMBIA)

**Versión:** 5.0 — actualización basada en el árbol de trabajo actual (2026-11-06)
**Stack real:** Next.js 16 (App Router) · React 19 · TypeScript strict · Drizzle ORM · PostgreSQL · Better Auth · Tailwind v4 · Vitest · Tauri (opcional)
**Provedor fiscal:** Factus (api.factus.com.co / api-sandbox.factus.com.co) — XML/QR a nombre del usuario final, certificado del proveedor

> Esta nota describe el código presente en el árbol de trabajo, que puede incluir cambios aún no confirmados. Contrasta cada flujo con su implementación antes de usarla como contrato de producción.

---

## 1. Identidad del sistema

POS táctil multi-tenant para comercio colombiano: venta rápida, inventario, caja, clientes con crédito interno y facturación electrónica DIAN **a través de Factus** (el proveedor tecnológico firma y radica; el sistema construye el payload, guarda CUFE/QR/XML y consulta estados).

No hay NestJS, Prisma, Redis, BullMQ ni microservicios: es un monolito Next.js con Server Actions sobre PostgreSQL. El documento anterior describía un diseño aspiracional; esto describe el código que existe.

## 2. Arquitectura en capas

```
UI React (app/, components/)  —  páginas del dashboard, modales, Tailwind v4
        │
Server Actions (app/actions/) —  operaciones del UI con sesión/roles; 'use server' en línea 1
        │
Lógica de dominio (lib/)      —  ventas, fiscal, inventario, devoluciones, backup y canales
        │
Drizzle (lib/db/schema/)      —  esquema por dominio; migraciones drizzle-kit
        │
PostgreSQL                    —  BD master + 1 BD física por tenant
        ↕
API Factus (HTTPS + OAuth2)   —  bills/validate, consulta de factura/enlaces y numbering-ranges
```

- **Sin API REST propia para el UI**: el frontend llama Server Actions directamente. Existen endpoints API para integraciones, cron, salud, setup y backup; `/api/v1` requiere sesión + header `X-Tenant-ID`.
- **Cola fiscal durable**: `fiscal_outbox` registra la emisión junto con la venta; `/api/cron/fiscal-outbox` procesa pendientes con reintentos y reconciliación. El modo MANUAL excluye sus eventos del cron hasta la transmisión explícita.
- **Edge**: `proxy.ts` (middleware) protege rutas, exige tenant en `/api/v1` y agrega headers de seguridad OWASP.
- **APIs de apoyo**: backup SQL autenticado en `/api/backup`, salud en `/api/health`, canales en `/api/channels/*` y cron fiscal.

## 3. Multi-tenant: una BD por tenant

Patrón **database-per-tenant** (no RLS):

| Base | Contenido |
|------|-----------|
| Master (`pruebas_POS` por defecto) | `user`, `session`, `account`, `verification`, `tenant`, `user_tenant`, plataforma |
| `pos_tenant_<slug>` | Todas las tablas de negocio (productos, ventas, facturas, etc.) |

- `lib/db/tenant-connection.ts` — `getTenantDb(slug)` con cache de pools; slug `default` usa el master.
- `lib/db/tenant-provisioner.ts` — `CREATE DATABASE pos_tenant_<slug>` + `runMigrations()` al crear un tenant (`createTenantWithAdmin` en `app/actions/tenants.ts`).
- Modo Tauri (escritorio): el runtime actual inicia un PostgreSQL 17 privado empaquetado y configura el backend local con su URL. `src-tauri/src/postgres.rs` gestiona el proceso y los datos de la aplicación. Hay comentarios/rama heredados sobre SQLite y `TAURI_DB_PATH` en `lib/db/tenant-connection.ts`; no asumir que representan el camino activo de escritorio sin verificar el arranque.
- `tenant.dbSlug` identifica la BD; `tenant.factus*` guarda las credenciales del proveedor por empresa.

## 4. Sesión, roles y aislamiento

- **Better Auth** (`lib/auth.ts`): email+password, sesión 7 días, cookie `better-auth.session_token`.
- **Resolución única** (`lib/auth/session-context.ts`): `requireUser()` → `requireTenantId()` / `requireRole(roles)`. Sin membresía = error `TENANT_NOT_ASSIGNED` (nunca se autocrea membresía).
- **Roles por tenant** (`user_tenant.role`): `ADMIN | CASHIER | MANAGER | VIEWER`.
- **Proxy** (`proxy.ts`): `/dashboard`, `/pos`, `/api/v1`, `/api/reports` exigen sesión; API sin sesión → 401 JSON; UI sin sesión → redirect `/login`; `/api/v1` exige `X-Tenant-ID`.
- **Auditoría**: `logAudit()` y `publishEvent()` (`app/actions/_shared.ts`) escriben en `audit_log` y `event`.
- Errores de sesión tipados en `lib/auth/errors.ts` (`CODE: detalle`).

## 5. Modelo de datos

Esquema en `lib/db/schema/` (fuente única; migraciones con `npm run db:generate` / `db:migrate`):

| Dominio | Archivo | Responsabilidad |
|---------|---------|--------|
| Auth y tenancy | `auth.ts`, `tenancy.ts` | Usuarios, sesiones, empresas, membresías y sedes |
| Catálogo e inventario | `catalog.ts` | Productos, categorías, existencias y movimientos |
| Clientes y ventas | `customers.ts`, `sales.ts` | Clientes/crédito, turnos de caja, ventas, ítems y pagos |
| Devoluciones | `returns.ts` | Devoluciones y sus ítems |
| Fiscal | `fiscal.ts`, `outbox.ts` | Numeración interna, documentos DIAN y cola de emisión/reconciliación |
| Compras y auditoría | `purchasing.ts`, `audit.ts` | Proveedores/órdenes, bitácora y eventos |
| Plataforma y asistente | `platform.ts`, `assistant.ts` | Claves API y entidades de canales, mensajes, borradores y alias |

El índice de esquemas es `lib/db/schema/index.ts`; las migraciones versionadas están en `drizzle/`. Tipos de identidad: `text` con ids legibles; montos `numeric`; fechas `timestamp`.

## 6. Flujo de venta (POS)

1. **Carrito** — `lib/hooks/use-cart.ts` (cliente); stock validado contra `inventory`.
2. **Pago** — `components/pos/PaymentModal.tsx`: modo único o **split** (varios métodos por venta). Reglas puras en `lib/utils/payment-splits.ts`:
   - `|suma pagos − total| ≤ 100` COP (redondeo a la centena vía `roundToNearest100`).
   - Medios no-efectivo exigen referencia (voucher/datáfono).
3. **`completeSale`** (`app/actions/sales.ts` → `lib/sales/service.ts`): completa la venta con sus pagos y cambios de inventario; la emisión fiscal se encola en `fiscal_outbox` dentro del flujo transaccional.
4. **Ticket local** — `generateInvoice()` reserva consecutivo de la tabla `numeration` (prefijo REC, folio de tickets internos) con fallback automático: si no hay resolución configurada, se crea una por defecto; **una numeración faltante nunca bloquea la venta**.
5. **Grid POS** — el stock mostrado descuenta cantidades del carrito en tiempo real (solo vista; la validación real es en `useCart`/server).

Caja: `cashier_session` (apertura con saldo inicial, cierre con conteo), movimientos en `cash_movement`, cierre Z en `app/actions/z-report.ts` (`/dashboard/cash-closure`).

## 7. Facturación electrónica (Factus → DIAN)

### 7.1 Configuración por tenant

Credenciales en la tabla `tenant` (`factusClientId/Secret/Username/Password`, `factusEnvironment` sandbox|producción, `factusNumberingRangeId`). Gestión UI en `/dashboard/settings` (FactusSection) vía `app/actions/factus-config.ts`. Sandbox: `https://api-sandbox.factus.com.co`.

### 7.2 Emisión

`emitSaleElectronicInvoice(saleId)` (`lib/invoicing/emit-invoice.ts`):

1. **Idempotencia**: si `fiscal_document` ya tiene CUFE para la venta, se retorna sin re-enviar.
2. `loadInvoiceContext()` + `buildInvoicePayload()` (`lib/invoicing/build-bill.ts`): cliente, ítems con IVA, pagos, totales exactos.
3. `FactusProvider.sendInvoice()` (`lib/invoicing/factus.ts`): OAuth2 con token cacheado → `POST /v2/bills/validate`; luego consulta los enlaces de la factura. El código contempla 409 por factura pendiente, expiración del token y reconciliación ante respuestas inciertas.
4. Respuesta mapeada (`factus-mappers.ts`): se persiste `fiscal_document` con **CUFE**, estado DIAN (`mapFiscalStatus` en `lib/catalogs/dian-status.ts`), XML, PDF y links.
5. **QR**: `qrCodeContent` = URL de consulta DIAN devuelta por Factus; fallback local `dianQrUrl(cufe, environment)` (`lib/fiscal/cufe.ts`) → `https://catalogo-vpfe[-hab].dian.gov.co/document/searchqr?documentkey=<CUFE>`.
6. Errores: `InvoiceProviderError` con `CODE:` + status HTTP; el detalle crudo se conserva para diagnóstico.

### 7.3 Estados y reintentos

Estados fiscales centralizados en `lib/catalogs/dian-status.ts` (transmitida, rechazada, pendiente…). `lib/fiscal/outbox.ts` reclama eventos pendientes de forma concurrente segura, aplica reintentos con backoff y puede reconciliar resultados externos inciertos. El endpoint `app/api/cron/fiscal-outbox/route.ts` está programado en `vercel.json`; la emisión manual se gestiona desde `/dashboard/invoices`. Los eventos con aprobación manual requerida no los toma el cron.

### 7.4 Numeración: dos mundos

| Origen | Uso |
|--------|-----|
| **Rangos Factus** (`listNumberingRanges()`, `tenant.factusNumberingRangeId`) | Numeración fiscal electrónica (facturas DIAN) |
| **Tabla local `numeration`** | Tickets internos POS (prefijo REC); NO alimenta la facturación electrónica |

## 8. Seguridad y convenciones

- Headers OWASP en el proxy (nosniff, DENY, HSTS…).
- Credenciales Factus cifradas en BD (`lib/security/encrypt.ts` para actualizaciones sensibles); placeholders detectados con `isPlaceholderCredential()`.
- **Convención de errores**: mensajes con prefijo `CODE: detalle` (ej. `AUTH_FAILED: ...`); el UI los muestra tal cual.
- `'use server'` obligatorio en la línea 1 de cada archivo de `app/actions/`.
- Fechas/horas de comprobantes se formatean en **America/Bogota en el servidor** (`formatBogotaDateTime` en `_shared.ts`) para evitar el corrimiento -5h.
- Nunca usar `Get-Content`/`Set-Content` de PowerShell sobre el código (BOM); escribir UTF-8 sin BOM.

## 9. Frontend

Rutas bajo `app/dashboard/`: `pos` / `pos-terminal` (venta), `invoices` (directorio + detalle + XML), `inventory`, `customers` (crédito interno: cupo, abonos, bloqueo), `returns`, `cashier`, `cash-closure` (cierre Z), `reports`, `users`, `settings` (empresa, Factus, numeraciones, usuarios y backup), `onboarding`, `categories`, `dian`.

Componentes: `components/ui/*` (DataTable, modales, NumberPromptModal — reemplazo del `prompt()` nativo), `components/tactical/*` (SectionPanel, TacticalButton), `components/pos/*`, `components/invoices/*`, `components/settings/*`. Tema oscuro con 89 design tokens en `@theme inline` (Tailwind v4). Gráficos con Recharts; QR con `qrcode.react`.

## 10. Estructura del repo

```
app/                  páginas App Router, Server Actions y endpoints API
  dashboard/          POS, caja, inventario, clientes, facturas, devoluciones, reportes y ajustes
  api/                auth, backup, channels, cron, health, reports, setup y v1
components/           UI por dominio (pos/, invoices/, inventory/, returns/, settings/, tactical/)
lib/
  auth/, db/          autenticación, tenancy, conexiones y esquemas Drizzle
  sales/, pos/, cash/ servicios de venta, punto de venta y caja
  fiscal/, invoicing/ cola fiscal, Factus, payloads, CUFE y estado DIAN
  inventory/, returns/ inventario y devoluciones
  backup/, assistant/, channels/ respaldo y asistente por canales
  reports/, api/      reportes y utilidades de API
drizzle/              migraciones SQL y journal
test/                 Vitest organizado por dominio e integración
scripts/              migraciones, seed, diagnóstico, preparación desktop y asistente
src-tauri/            runtime desktop, backend Next empaquetado y PostgreSQL privado
postman-dian/         colecciones de prueba
docs/obsidian/        notas operativas del vault
proxy.ts              middleware (auth, tenant, headers)
```

## 11. Calidad y verificación

Comprobaciones disponibles en `package.json`:

```powershell
npm run typecheck
npm test
npm run build
```

Tests: `test/` se organiza por acciones, asistente, auth, backup, caja, catálogos, crédito, DB, fiscal, inventario, facturación, POS, reportes y devoluciones. Ejecuta `npm test` para la suite actual; no se fija aquí un conteo, porque cambia con el árbol de trabajo.

Smoke: dev server en :3000; rutas públicas 200/307; `/api/v1/invoices` sin sesión → 401.

## 12. Operación

- **Scripts npm**: `dev` (corre `predev` → `db:doctor --soft`), `build`, `typecheck`, `test`, `db:generate`, `db:migrate`, `db:push`, `db:studio`, `db:seed`, `db:doctor`, `tauri:dev`, `tauri:build`.
- **Variables**: `DATABASE_URL` (o `POSTGRES_*`), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`; credenciales Factus NO van en env: van por tenant en BD (con cifrado).
- **Docker**: `docker-compose.yml` (Postgres) + Dockerfiles de app; `start.bat` / `stop.bat` locales.
- **Configuración**: usar `.env.example` como referencia y crear `.env` local con secretos propios; no copiar valores de ejemplo ni documentar credenciales reales en el vault.
- **Desktop**: Tauri empaqueta el backend de producción y PostgreSQL privado; `npm run build:desktop` prepara la distribución.

## 13. Fuera de alcance actual

No implementado: NestJS/Prisma/Redis/BullMQ, firma XML propia (la firma la hace Factus), RLS a nivel SQL, contingencia DIAN offline completa, portal de cliente, compras RADIAN, conectores ERP y DRP/Kubernetes. La cola fiscal sí está implementada mediante `fiscal_outbox`; no confundirla con BullMQ. Los comandos nativos de impresión, báscula y ventas offline en `src-tauri/src/main.rs` son actualmente demostrativos, no una integración de hardware/contingencia lista para producción. La pestaña "RESOLUCIONES DIAN" gestiona numeración local REC; la numeración fiscal electrónica se controla con los rangos de Factus.
