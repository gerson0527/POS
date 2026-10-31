# ARQUITECTURA: SISTEMA POS CON FACTURACIÓN ELECTRÓNICA DIAN (COLOMBIA)

**Versión:** 4.0 — documento de solo lo implementado
**Stack real:** Next.js 16 (App Router) · React 19 · TypeScript strict · Drizzle ORM · PostgreSQL · Better Auth · Tailwind v4 · Vitest · Tauri (opcional)
**Provedor fiscal:** Factus (api.factus.com.co / api-sandbox.factus.com.co) — XML/QR a nombre del usuario final, certificado del proveedor

---

## 1. Identidad del sistema

POS táctil multi-tenant para comercio colombiano: venta rápida, inventario, caja, clientes con crédito interno y facturación electrónica DIAN **a través de Factus** (el proveedor tecnológico firma y radica; el sistema construye el payload, guarda CUFE/QR/XML y consulta estados).

No hay NestJS, Prisma, Redis, BullMQ ni microservicios: es un monolito Next.js con Server Actions sobre PostgreSQL. El documento anterior describía un diseño aspiracional; esto describe el código que existe.

## 2. Arquitectura en capas

```
UI React (app/, components/)  —  páginas del dashboard, modales, Tailwind v4
        │
Server Actions (app/actions/) —  única puerta de escritura; 'use server' en línea 1
        │
Lógica de dominio (lib/)      —  facturación, fiscal, catálogos, utils puras
        │
Drizzle (lib/db/schema/)      —  esquema por dominio; migraciones drizzle-kit
        │
PostgreSQL                    —  BD master + 1 BD física por tenant
        ↕
API Factus (HTTPS + OAuth2)   —  bills/validate, bills/send, numbering-ranges
```

- **Sin API REST propia para el UI**: el frontend llama Server Actions directamente. Existe una API pública mínima bajo `/api/v1` (requiere sesión + header `X-Tenant-ID`).
- **Sin colas**: la emisión de facturas es síncrona desde la acción; los fallos se reintentan a mano desde `/dashboard/invoices`.
- **Edge**: `proxy.ts` (middleware) protege rutas, exige tenant en `/api/v1` y agrega headers de seguridad OWASP.

## 3. Multi-tenant: una BD por tenant

Patrón **database-per-tenant** (no RLS):

| Base | Contenido |
|------|-----------|
| Master (`pruebas_POS` por defecto) | `user`, `session`, `account`, `verification`, `tenant`, `user_tenant`, plataforma |
| `pos_tenant_<slug>` | Todas las tablas de negocio (productos, ventas, facturas, etc.) |

- `lib/db/tenant-connection.ts` — `getTenantDb(slug)` con cache de pools; slug `default` usa el master.
- `lib/db/tenant-provisioner.ts` — `CREATE DATABASE pos_tenant_<slug>` + `runMigrations()` al crear un tenant (`createTenantWithAdmin` en `app/actions/tenants.ts`).
- Modo Tauri (escritorio): cada tenant es un archivo SQLite `<data_dir>/tenants/<slug>.db` (detección por `TAURI_DB_PATH`).
- `tenant.dbSlug` identifica la BD; `tenant.factus*` guarda las credenciales del proveedor por empresa.

## 4. Sesión, roles y aislamiento

- **Better Auth** (`lib/auth.ts`): email+password, sesión 7 días, cookie `better-auth.session_token`.
- **Resolución única** (`lib/auth/session-context.ts`): `requireUser()` → `requireTenantId()` / `requireRole(roles)`. Sin membresía = error `TENANT_NOT_ASSIGNED` (nunca se autocrea membresía).
- **Roles por tenant** (`user_tenant.role`): `ADMIN | CASHIER | MANAGER | VIEWER`.
- **Proxy** (`proxy.ts`): `/dashboard`, `/pos`, `/api/v1`, `/api/reports` exigen sesión; API sin sesión → 401 JSON; UI sin sesión → redirect `/login`; `/api/v1` exige `X-Tenant-ID`.
- **Auditoría**: `logAudit()` y `publishEvent()` (`app/actions/_shared.ts`) escriben en `audit_log` y `event`.
- Errores de sesión tipados en `lib/auth/errors.ts` (`CODE: detalle`).

## 5. Modelo de datos (30 tablas Drizzle)

Esquema en `lib/db/schema/` (fuente única; migraciones con `npm run db:generate` / `db:migrate`):

| Dominio | Archivo | Tablas |
|---------|---------|--------|
| Auth (Better Auth) | `auth.ts` | `user`, `session`, `account`, `verification` |
| Tenancy | `tenancy.ts` | `tenant`, `user_tenant`, `location` |
| Catálogo e inventario | `catalog.ts` | `category`, `product`, `product_category`, `inventory`, `inventory_movement`, `stock_alert` |
| Clientes | `customers.ts` | `customer`, `customer_credit_transaction` |
| Ventas y caja | `sales.ts` | `cashier_session`, `cash_movement`, `sale`, `sale_item`, `payment` |
| Fiscal | `fiscal.ts` | `numeration` (consecutivos locales), `fiscal_document` (facturas electrónicas) |
| Compras | `purchasing.ts` | `supplier`, `purchase_order`, `purchase_order_item` |
| Auditoría | `audit.ts` | `audit_log`, `event` |
| Plataforma | `platform.ts` | `api_key`, `webhook`, `subscription` |

Tipos de identidad: `text` con ids legibles (`sale_...`, `fact_...`, `num_...`); montos `numeric`; fechas `timestamp`.

## 6. Flujo de venta (POS)

1. **Carrito** — `lib/hooks/use-cart.ts` (cliente); stock validado contra `inventory`.
2. **Pago** — `components/pos/PaymentModal.tsx`: modo único o **split** (varios métodos por venta). Reglas puras en `lib/utils/payment-splits.ts`:
   - `|suma pagos − total| ≤ 100` COP (redondeo a la centena vía `roundToNearest100`).
   - Medios no-efectivo exigen referencia (voucher/datáfono).
3. **`completeSale`** (`app/actions/sales.ts`): crea `payment`(s), decrementa `inventory`, marca la venta; descuento opcional por porcentaje.
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
3. `FactusProvider.sendInvoice()` (`lib/invoicing/factus.ts`): OAuth2 con `TokenCache` (`factus-http.ts`) → `POST /v2/bills/validate` → si ok, `POST /v2/bills/send`.
4. Respuesta mapeada (`factus-mappers.ts`): se persiste `fiscal_document` con **CUFE**, estado DIAN (`mapFiscalStatus` en `lib/catalogs/dian-status.ts`), XML, PDF y links.
5. **QR**: `qrCodeContent` = URL de consulta DIAN devuelta por Factus; fallback local `dianQrUrl(cufe, environment)` (`lib/fiscal/cufe.ts`) → `https://catalogo-vpfe[-hab].dian.gov.co/document/searchqr?documentkey=<CUFE>`.
6. Errores: `InvoiceProviderError` con `CODE:` + status HTTP; el detalle crudo se conserva para diagnóstico.

### 7.3 Estados y reintentos

Estados fiscales centralizados en `lib/catalogs/dian-status.ts` (transmitida, rechazada, pendiente…). El botón **TRANSMITIR DIAN** en `/dashboard/invoices` re-emite documentos pendientes/rechazados a mano. No hay worker automático.

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

Rutas bajo `app/dashboard/`: `pos` / `pos-terminal` (venta), `invoices` (directorio + detalle + XML), `inventory`, `customers` (crédito interno: cupo, abonos, bloqueo), `cashier`, `cash-closure` (cierre Z), `reports`, `users`, `settings` (empresa, Factus, numeraciones, usuarios), `onboarding`, `categories`, `dian`.

Componentes: `components/ui/*` (DataTable, modales, NumberPromptModal — reemplazo del `prompt()` nativo), `components/tactical/*` (SectionPanel, TacticalButton), `components/pos/*`, `components/invoices/*`, `components/settings/*`. Tema oscuro con 89 design tokens en `@theme inline` (Tailwind v4). Gráficos con Recharts; QR con `qrcode.react`.

## 10. Estructura del repo

```
app/                  páginas App Router + actions/ (Server Actions por dominio)
components/           UI (ui/, tactical/, pos/, invoices/, settings/, ...)
lib/
  auth/               session-context, errors
  db/                 index, tenant-connection, tenant-provisioner, migrate, schema/
  invoicing/          Factus: types, factus-http, factus, build-bill, emit-invoice, mappers
  fiscal/             cufe.ts (CUFE + QR DIAN)
  catalogs/           dian-status, payment-methods, customers
  utils/              payment-splits, pos-utils, date-ranges, format
  hooks/              use-cart, use-protected-query
  reports/            render, pdf-generator (Puppeteer)
proxy.ts              middleware (auth, tenant, headers)
drizzle/              migraciones generadas
test/                 vitest (7 archivos, 70 tests)
scripts/              seed, db-migrate
src-tauri/            empaquetado escritorio (opcional)
postman-dian/         colecciones de prueba API
```

## 11. Calidad y verificación

Gate obligatorio tras cada cambio (en Windows usar `C:\nvm4w\nodejs\node.exe` si el `node` del PATH está roto):

```powershell
node .\node_modules\typescript\bin\tsc --noEmit          # 0 errores
node .\node_modules\vitest\vitest.mjs run                # 70/70 (7 archivos)
node .\node_modules\next\dist\bin\next build             # build limpio
```

Tests: `test/pos/payment-splits` (split + clasificador de medio de pago), `test/invoicing/build-bill`, `test/invoicing/factus-mappers`, `test/fiscal/cufe`, `test/catalogs/*`, `test/reports/escape`.

Smoke: dev server en :3000; rutas públicas 200/307; `/api/v1/invoices` sin sesión → 401.

## 12. Operación

- **Scripts npm**: `dev` (corre `predev` → `db:doctor --soft`), `build`, `typecheck`, `test`, `db:generate`, `db:migrate`, `db:push`, `db:studio`, `db:seed`, `db:doctor`, `tauri:dev`, `tauri:build`.
- **Variables**: `DATABASE_URL` (o `POSTGRES_*`), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`; credenciales Factus NO van en env: van por tenant en BD (con cifrado).
- **Docker**: `docker-compose.yml` (Postgres) + Dockerfiles de app; `start.bat` / `stop.bat` locales.
- **Usuario admin semilla**: `admin@posdian.com` / `Admin123456!` (cambiar en producción).
- **DB local de desarrollo**: `postgresql://...@localhost:5432/pruebas_POS`.

## 13. Fuera de alcance actual

No implementado (era diseño aspiracional de versiones anteriores): NestJS/Prisma/BullMQ/Redis, colas y workers, S3, Prometheus/Datadog, firma XML propia (la firma la hace Factus), RLS a nivel SQL, contingencia DIAN offline, agente de hardware ESC/POS, portal de cliente, compras RADIAN, conectores ERP, DRP/Kubernetes. La pestaña "RESOLUCIONES DIAN" de settings solo gestiona tickets locales REC; la numeración fiscal electrónica se controla con los rangos de Factus.
