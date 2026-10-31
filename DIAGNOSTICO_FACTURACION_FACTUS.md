# Diagnóstico y plan — Flujo de facturación electrónica (Factus V2)

> Fecha de análisis: 2026-10-26.
> Análisis basado en el código real del repositorio (no en la documentación interna)
> y verificado contra la documentación vigente de Factus
> (`developers.factus.com.co/facturas/crear-y-validar`, Preguntas frecuentes).
>
> **Alcance acordado:** solo el flujo venta → factura → persistencia del resultado de
> Factus. Sin voz, sin chat, sin agentes de IA, sin reemplazar Factus.
> Nota para fases futuras: el proveedor de IA elegido será **opencode**; la
> arquitectura debe dejar las llamadas de IA exclusivamente en el servidor, igual
> que las credenciales de Factus. No se implementa nada de IA en este plan.

---

## 1. Flujo actual (como está implementado)

```
POS (app/dashboard/pos/page.tsx)
 └─ createSale()            app/actions/sales.ts     → venta DRAFT ligada a turno de caja abierto (cashier_session del día, FOR UPDATE del ticket por advisory lock)
 └─ completeSale()          app/actions/sales.ts     → transacción: lock de venta + turno, valida pagos vs total, descuenta stock, inserta payments,
    │                                                   encola en fiscal_outbox (misma transacción) y COMMIT
    └─ retryFiscalEmission() lib/fiscal/outbox.ts    → fuera de la transacción: reclama el evento y llama a
       └─ emitSaleElectronicInvoice() lib/invoicing/emit-invoice.ts
          ├─ chequeo de idempotencia local (fiscal_document.uniqueCode)
          ├─ buildInvoicePayload()  lib/invoicing/build-bill.ts   (venta+ítems+pagos+cliente → InvoicePayload)
          ├─ FactusProvider.sendInvoice()  lib/invoicing/factus.ts
          │   ├─ POST /oauth/token (password grant, cache en factus-http.ts)
          │   ├─ POST /v2/bills/validate  (crear y validar son UNA sola llamada — correcto según docs)
          │   └─ GET /v2/bills/{number}   (solo para completar links QR/PDF/XML)
          └─ upsert en fiscal_document (CUFE, QR, PDF, XML, estado vía mapFiscalStatus)
 └─ generateInvoice()       app/actions/sales.ts     → comprobante interno REC (numeración local, NO fiscal)
 └─ emitFactusElectronicInvoice() (cliente, redundante en modo AUTO; vía manual en /dashboard/invoices)

Reintentos: /api/cron/fiscal-outbox → processFiscalOutbox() (FOR UPDATE SKIP LOCKED, backoff exponencial, máx. 10 intentos)
```

Persistencia del resultado: tabla `fiscal_document` (lib/db/schema/fiscal.ts) con
`uniqueCode` (CUFE), `qrCodeContent`, `pdfStorageKey`, `xmlSignedStorageKey`,
snapshots de cliente/totales/pagos, e índices únicos:
- `fiscal_document_sale_invoice_unique` (una factura electrónica por venta)
- `fiscal_outbox_sale_event_unique` (un evento de emisión por venta)

### Verificación contra la documentación de Factus (clave)

- `POST /v2/bills/validate` **crea y valida en una sola llamada**. El código lo hace así. ✔
- `reference_code` **es idempotente solo para facturas ya validadas**: reenviar uno
  procesado devuelve la factura existente (incluso con datos distintos, HTTP 201).
- Si existe una **factura pendiente** (creada pero no enviada a la DIAN), Factus
  responde **409 Conflict** y la documentación exige **eliminar la factura por
  referencia** y crear una nueva. El código **no maneja este caso** (ver F-02).
- El campo `errors` de la respuesta contiene notificaciones DIAN que **no implican
  rechazo**; la fuente de verdad es `is_validated`. El código ya lo trata así. ✔
- `cash_rounding_amount`: la doc permite hasta ±500; el código limita a ±50 (más
  conservador, válido). ✔
- Montos como string con máximo 2 decimales (`toMoneyString`). ✔

---

## 2. FALLOS CONFIRMADOS

### F-01 · El modo de transmisión MANUAL no se respeta en el servidor — **crítico**
- **Archivo/función:** `app/actions/sales.ts` → `completeSaleInternal()`
- `completeSale` siempre encola (`enqueueFiscalEmission`) y emite inmediatamente
  (`retryFiscalEmission`), sin consultar `tenant.dianTransmissionMode`. El chequeo
  de modo MANUAL vive solo en el **cliente** (`app/dashboard/pos/page.tsx`, línea ~280),
  que únicamente evita la segunda llamada redundante. Resultado: con modo MANUAL la
  factura **se transmite igual a la DIAN** al completar la venta, y la contadora cree
  que está pendiente de revisión.

### F-02 · 409 Conflict de Factus (factura pendiente) sin manejar — **crítico**
- **Archivo/función:** `lib/invoicing/factus.ts` → `FactusProvider.sendInvoice()`
- La doc de Factus: si hay una factura con ese `reference_code` creada pero no
  validada, responde `409 Conflict` y hay que **eliminarla por referencia** y
  recrearla. El código trata el 409 como fallo genérico → el outbox reintenta con el
  mismo `reference_code` → 409 eterno hasta agotar `maxAttempts` y quedar `FAILED`.
  No existe en el código ningún `DELETE /v2/bills/destroy/reference/{code}` ni
  consulta `GET /v2/bills` por referencia.

### F-03 · Sin reconciliación ante resultado externo incierto — **crítico**
- **Archivos:** `lib/invoicing/*` (función inexistente), `lib/fiscal/outbox.ts`
- No hay ninguna función que **consulte** a Factus por `reference_code` para saber si
  una factura quedó emitida (timeout, caída del proceso, fallo de persistencia
  local). La única estrategia es "reenviar y confiar en la idempotencia", que solo
  funciona para facturas **ya validadas**; en el caso pendiente cae en F-02.
- Caso concreto: si Factus emite pero el guardado en `fiscal_document` falla,
  `emitSaleElectronicInvoice` devuelve `success: true` con una advertencia en el
  mensaje → el outbox marca el evento `DONE` → el documento local queda **sin CUFE**
  y nadie lo recupera automáticamente (solo un reintento manual casual lo arreglaría).

### F-04 · Ningún proceso ejecuta el outbox — **crítico operativo**
- **Archivos:** `vercel.json`, `app/api/cron/fiscal-outbox/route.ts`
- El endpoint del cron existe y está protegido con `CRON_SECRET`, pero `vercel.json`
  **no define ningún cron** y no hay otro scheduler en el repo. Si la emisión falla al
  completar la venta, el reintento automático prometido por el outbox **nunca ocurre**;
  depende de que alguien entre a `/dashboard/invoices` y pulse "TRANSMITIR DIAN".

### F-05 · Emisión sin validar el estado de la venta
- **Archivo/función:** `lib/invoicing/emit-invoice.ts` → `emitSaleElectronicInvoice()`
- No valida `sale.status === 'COMPLETED'`. La server action
  `emitFactusElectronicInvoice` (app/actions/factus-service.ts) permite a cualquier
  rol autorizado emitir una venta **DRAFT o cancelada** pasando un `saleId` arbitrario
  del propio tenant (el aislamiento de tenant sí está bien).

### F-06 · Confusión entre ticket interno y numeración fiscal
- **Archivo/función:** `lib/invoicing/emit-invoice.ts` → `fiscalValues`
- Al persistir el resultado de Factus guarda `consecutive: String(sale.ticketNumber)`
  (el ticket interno del POS) y `prefix: 'FACT'` **hardcodeado**, aunque el número
  fiscal real (`result.billNumber`, p. ej. `SETP990012345`) tiene su propio prefijo
  asignado por el rango de Factus. Además **sobrescribe** el documento interno REC
  creado por `generateInvoice` (se pierde el registro del comprobante interno y su
  consecutivo consumido).

### F-07 · Municipio y tributo hardcodeados para todos los tenants
- **Archivo/función:** `lib/invoicing/build-bill.ts` → `loadInvoiceContext()`
- `municipalityCode: '11001'` (Bogotá) y `tributeCode: 'ZZ'` fijos, ignorando
  cualquier dato real del tenant. El cliente tampoco se vincula a la tabla
  `customer` (solo se usa el snapshot plano de `sale.customer*`), así que su
  municipio/tributo/tipo de persona reales nunca llegan a Factus. Facturas de
  clientes fuera de Bogotá salen con municipio errado.

### F-08 · Doble clic / concurrencia en la emisión manual
- **Archivos:** `app/actions/factus-service.ts` → `emitFactusElectronicInvoice()`,
  `lib/invoicing/emit-invoice.ts`
- La emisión manual llama a `emitSaleElectronicInvoice` **directo**, sin el claim
  transaccional que sí tiene `retryFiscalEmission`. Dos clics simultáneos pasan ambos
  el chequeo de idempotencia (lectura sin lock) y hacen **dos POST** a Factus. Para
  facturas ya validadas lo salva la idempotencia del proveedor; para pendientes cae
  en F-02. El frontend solo deshabilita el botón (`emittingId`), insuficiente.

### F-09 · Fetch sin timeout
- **Archivos:** `lib/invoicing/factus-http.ts` (`requestFactusToken`),
  `lib/invoicing/factus.ts` (`sendInvoice`, `listNumberingRanges`),
  `factus-mappers.ts` (`fetchBillLinks`)
- Ninguna llamada HTTP tiene `AbortSignal.timeout`. Un cuelgue de Factus bloquea la
  server action de completar venta (el cajero queda esperando) o el worker del outbox.

### F-10 · Sin auditoría de la emisión
- **Archivos:** `lib/invoicing/emit-invoice.ts`, `app/actions/factus-service.ts`
- No se registra en `audit_log` **quién** solicitó la emisión, con qué resultado y
  referencia externa. `correlationId` es `corr_${Date.now()}` (no rastreable). La
  venta completada sí se audita, la transmisión fiscal no.

### F-11 · Validaciones previas del cliente inexistentes (se rellenan defaults)
- **Archivo/función:** `lib/invoicing/build-bill.ts` → `buildCustomerPayload()`
- En vez de validar, inventa datos: `email: 'no-email@posretail.local'`,
  `address: 'Sin dirección registrada'`, tributo `ZZ` para todos. No hay ninguna
  verificación previa a la emisión de que el cliente tenga los datos que exige el
  proveedor; los errores solo se descubren con el rechazo de Factus.

### F-12 · Tratamiento tributario limitado y exento/excluido confundidos
- **Archivo/función:** `lib/invoicing/factus-mappers.ts` → `mapTax()`
- Solo existe IVA (`code: '01'`). Tarifa 0 se marca siempre `is_excluded: true`, que
  confunde **exento** (tarifa 0, base gravable declarada) con **excluido** (sin IVA).
  No hay soporte para INC ni otros tributos. El producto no tiene campo de
  tratamiento tributario más allá de `ivaRate`.

---

## 3. RIESGOS POR VERIFICAR (no confirmados como bug)

| # | Riesgo | Dónde | Cómo verificarlo |
|---|--------|-------|------------------|
| R-01 | ¿Existe un scheduler externo (fuera del repo) que llame a `/api/cron/fiscal-outbox` con `CRON_SECRET`? Si existe, F-04 baja de severidad. | Infraestructura | Confirmar con el equipo / panel de Vercel |
| R-02 | Precisión monetaria: toda la cadena usa `number` (float) con `toFixed(2)` y redondeo a $100. La estrategia existe y es coherente, pero el cuadre ítems+descuento+IVA vs `payment_details` ante descuentos con decimales debe probarse contra el sandbox (Factus valida que los totales cuadren). | `pos-utils.ts`, `build-bill.ts` | Casos de prueba de redondeo + emisión en sandbox |
| R-03 | `STORE_CREDIT` se envía como `payment_form: '2'` (crédito) pero `payment_method_code: '10'` (efectivo) con `due_date` +30 días, mientras la deuda interna vence a 15 días (`completeSale`). Validar que la combinación sea aceptada y coherente. | `factus-mappers.ts` → `toPaymentDetail` | Emisión sandbox con pago a crédito |
| R-04 | `fiscal_document` no guarda snapshot de **ítems**, y `sale_item` no guarda nombre/SKU del producto: renombrar un producto después cambia la reconstrucción local de lo facturado (el XML/PDF oficial sí queda en Factus). | `lib/db/schema/sales.ts`, `fiscal.ts` | Decidir si se agrega `itemsSnapshot` |
| R-05 | El rango de numeración configurado no se valida contra Factus al emitir (puede estar inactivo/agotado/de otro tipo de documento); el error solo aparece como rechazo. | `build-bill.ts`, `FactusSection.tsx` | Validación previa opcional con `/v2/numbering-ranges` |
| R-06 | `TokenCache` es por instancia y `getInvoiceProvider` crea un provider nuevo en cada request → **cada emisión hace un password grant completo** (el token dura 1 h según docs). Riesgo de rate-limit, no de corrección. | `lib/invoicing/index.ts`, `factus-http.ts` | Cache por `tenantId+clientId` a nivel de módulo |
| R-07 | Logs: `sendInvoice` escribe los primeros 500 caracteres del body de error (puede incluir datos del cliente; no incluye tokens). Decidir política. | `factus.ts` | Revisión de política de logs |
| R-08 | `splitNit` trata cualquier documento >9 dígitos como NIT+DV; una cédula larga de un cliente tipo '31' mal clasificado perdería un dígito. | `build-bill.ts` | Test unitario + validación de tipo de documento |

### Lo que está bien (reutilizar, no tocar)

- Patrón outbox transaccional (`FOR UPDATE SKIP LOCKED`, backoff, `maxAttempts`) — correcto.
- `reference_code` estable y único por venta (`FACT-{saleId}`) — alineado con la doc de Factus.
- `is_validated` como fuente de verdad; HTTP 200 sin CUFE **no** se trata como aceptada; estado desconocido nunca se asume aceptado (`mapFiscalStatus`).
- Índices únicos de BD (factura única por venta, evento único por venta) — base sólida de idempotencia local.
- No se mantiene transacción de BD abierta durante la llamada HTTP a Factus (commit antes de emitir). ✔
- Emitir la factura **no** marca la venta como pagada (los pagos se registran al completar la venta, correcto). ✔
- Credenciales cifradas (AES-256-GCM) solo en servidor, secretos nunca devueltos al cliente, logs y auditoría de configuración redactados.
- `completeSale`: lock de venta y turno, validación de fecha de negocio, pagos > 0, cuadre pago vs total, control de stock y de crédito.
- Aislamiento de tenant presente en todas las consultas revisadas (ventas, documentos, API v1 con API keys scoped).

---

## 4. PLAN PROPUESTO POR FASES (esperando aprobación antes de tocar código)

### Fase 1 — Correcciones críticas de flujo e idempotencia (F-01, F-02, F-03, F-08)
1. **Respetar `dianTransmissionMode` en el servidor**: `completeSaleInternal` encola
   siempre (durabilidad) pero solo dispara `retryFiscalEmission` si el modo es AUTO;
   en MANUAL el evento queda `PENDING` con `nextAttemptAt` nulo/diferido y se emite
   solo desde `/dashboard/invoices`. Eliminar la llamada redundante del cliente POS.
2. **Manejar el 409 de Factus** en `sendInvoice`: detectar el conflicto de factura
   pendiente, llamar `DELETE /v2/bills/destroy/reference/{reference_code}` (endpoint
   documentado) y reintentar la creación una vez; si falla, devolver estado
   `UNCERTAIN` accionable.
3. **Función de reconciliación** `lookupBillByReference(referenceCode)` usando
   `GET /v2/bills?filter[reference_code]=...`: se usa (a) antes de reenviar cuando el
   último resultado fue incierto (timeout/red), y (b) para recuperar CUFE/links cuando
   Factus emitió pero falló la persistencia local — sin reenviar.
4. **Claim único también en la emisión manual**: `emitFactusElectronicInvoice` pasa
   por `retryFiscalEmission` (o un claim equivalente) en vez de llamar directo al
   dominio; elimina la carrera de doble clic a nivel servidor.
5. **No marcar `DONE` el outbox si el CUFE no quedó persistido**: el caso "emitida en
   DIAN, fallo local" deja el evento en `PENDING` con un flag para que el reintento
   use la reconciliación (3) y solo persista, sin reenviar.

### Fase 2 — Validaciones previas y correctitud del payload (F-05, F-06, F-07, F-11, F-12)
1. Validar en `emitSaleElectronicInvoice`: venta `COMPLETED`, con ítems, del tenant.
2. Guardar numeración fiscal real: `consecutive`/`prefix` desde `billNumber` de
   Factus (parseado), no desde el ticket interno; conservar el comprobante REC como
   registro separado o campos separados (decisión en implementación, con migración).
3. Usar municipio/tributo reales del tenant (columnas nuevas o existentes en
   `tenant`) y del cliente (join con `customer` cuando exista); defaults solo como
   último recurso explícito y visible.
4. Validación previa a la emisión con errores accionables (cliente incompleto,
   cantidades/precios inválidos, rango no configurado) **antes** de llamar a Factus.
5. Revisar `mapTax` para distinguir exento vs excluido según configuración del
   producto (requiere campo nuevo en `product`, migración incluida).

### Fase 3 — Operación, estados y UX (F-04, F-09, F-10 + estados)
1. Configurar el cron en `vercel.json` (`/api/cron/fiscal-outbox`) y documentar `CRON_SECRET`.
2. `AbortSignal.timeout` en todas las llamadas a Factus; timeout → estado incierto →
   reconciliación de Fase 1, nunca "rechazada".
3. Auditoría de emisión: `audit_log` con usuario, venta, tenant, `reference_code`,
   resultado; `correlationId` real (UUID) propagado.
4. Estados claros en UI (`/dashboard/invoices` y popup del POS): PENDIENTE /
   EN PROCESO / TRANSMITIDA (SUBMITTED) / ACEPTADA / RECHAZADA / ERROR RECUPERABLE /
   RESULTADO INCIERTO, derivados de `fiscal_document.status` + outbox — nunca del
   HTTP 200. Resumen antes de emitir y confirmación explícita en la emisión manual.
5. Cache de token por tenant a nivel de módulo (R-06).

### Fase 4 — Pruebas y verificación
1. Unitarias (mocks de fetch/DB): toda la matriz de la sección 5.
2. Integración contra **sandbox** de Factus: factura válida, rechazo, 409+destroy,
   reconciliación por referencia, token expirado (forzar 401), crédito de tienda,
   descuentos y redondeos.
3. `npm run typecheck`, `npm run test`, `npm run build` y reporte de qué quedó
   verificado y qué pendiente. **No** se declara listo para producción con solo
   mocks: se exige al menos una corrida completa en sandbox.

Cada fase termina con typecheck + tests verdes antes de pasar a la siguiente.
Migraciones previstas: campos fiscales del tenant/cliente (Fase 2), posible
`itemsSnapshot` en `fiscal_document` (R-04, a decidir), flag de reconciliación en
`fiscal_outbox` (Fase 1).

---

## 5. Matriz de pruebas obligatorias

| Caso | Tipo | Estado actual |
|------|------|---------------|
| Factura válida (cliente completo, IVA 19%) | Mock + sandbox | Parcial (`build-bill.test.ts`, `factus-mappers.test.ts`) |
| Cliente incompleto (sin email/dirección/municipio) | Mock | ❌ hoy se rellenan defaults en silencio |
| Venta/producto de otro tenant | Mock | Parcial (queries con tenantId); falta test explícito |
| Cantidades o montos inválidos (0, negativos, NaN) | Mock | Parcial (solo en createSale/completeSale) |
| Tratamientos tributarios distintos (19/5/0, exento vs excluido) | Mock + sandbox | ❌ solo IVA; exento/excluido confundidos |
| Descuentos y redondeos (cuadre payment_details vs total) | Mock + sandbox | Parcial (`computeCashRoundingAmount` testeado) |
| Doble clic / solicitudes concurrentes a emisión | Mock (BD real ideal) | ❌ carrera confirmada en emisión manual (F-08) |
| Rechazo del proveedor (`is_validated:false` + errors de rechazo) | Mock | Parcial (`getFactusDianStatus` testeado) |
| Token expirado (401 en bills → re-auth y retry) | Mock | ❌ no hay retry por 401 en sendInvoice |
| Timeout con resultado externo desconocido | Mock | ❌ sin timeout ni reconciliación (F-03, F-09) |
| 409 factura pendiente → destroy + recrear | Mock + sandbox | ❌ sin manejar (F-02) |
| Emitida en Factus con fallo de persistencia local → recuperar sin duplicar | Mock | ❌ outbox marca DONE y se pierde (F-03) |
| Modo MANUAL no transmite al completar la venta | Mock | ❌ falla hoy (F-01) |
| Cambios posteriores en producto/cliente no alteran lo emitido | Mock | ❌ sin itemsSnapshot (R-04) |

Reglas: mocks para la suite automatizada (`vitest`), sandbox de Factus para
integración. **Nunca** emitir en producción durante el desarrollo
(`factusEnvironment: 'sandbox'` / `DIAN_PROVIDER_ENVIRONMENT=sandbox`).

---

## 6. Qué NO se va a hacer en este trabajo

- Micrófono, transcripción, chat o agentes de IA (opencode queda anotado como
  proveedor de IA para una fase posterior, siempre server-side).
- Reemplazar Factus o crear otro backend de facturación.
- Refactorizaciones fuera de los archivos del flujo de facturación.

---

**Siguiente paso:** aprobar (o ajustar) las fases de la sección 4. No se modifica
código hasta recibir aprobación.
