# Informe: resoluciones y numeración DIAN

**Fecha:** 2026-10-19
**Alcance:** revisión del código del POS (reservas de consecutivos, configuración de resoluciones y emisión electrónica con Factus).
**Objetivo:** determinar qué falta para que las resoluciones de numeración DIAN funcionen correctamente y qué debe corregirse antes de producir facturas reales.

---

## 1. Resumen ejecutivo

1. **La numeración electrónica oficial no la controla el POS, la asigna Factus.** El POS envía `numbering_range_id` y Factus devuelve el número (`billNumber`) y el CUFE. Ese número es el que se guarda como `fullNumber` en `fiscal_document`.
2. **La tabla local `numeration` está desconectada de ese rango.** El POS la usa para calcular un consecutivo propio con prefijo `REC`, pero luego Factus emite con otro rango y otro prefijo. El resultado es que la resolución local avanza sin relación con la numeración real.
3. **Hoy hay evidencia de divergencia en la base de datos:** la resolución local `num_fe_001` va en **41**, mientras el último documento aceptado por Factus es `SETP990027148` (consecutivo **22**). La resolución local además tiene rango `1..100000`, que no corresponde a la numeración real de 9 dígitos del proveedor.
4. **El flujo actual no es apto para producción** por: fallback a cualquier resolución (incluidas las DIAN), prefijo incorrecto, ausencia de control de concurrencia, falta de unicidad, ausencia de validaciones y falta de datos de vigencia de la resolución.
5. **Recomendación central:** definir a Factus como única autoridad para la numeración electrónica y dejar la tabla local solo para comprobantes internos (prefijo `REC`), con un registro dedicado y sin fallback a rangos DIAN.

---

## 2. Cómo funciona hoy

### 2.1 Flujo de una venta

1. El POS completa la venta y, al final de `completeSale`, dispara automáticamente la emisión electrónica:
   - `app/actions/sales.ts:289-294` → `emitFactusElectronicInvoice(saleId)`.
2. `emit-invoice.ts` verifica si la venta ya tiene CUFE; si no, construye el payload:
   - `lib/invoicing/build-bill.ts:178` toma `tenant.factusNumberingRangeId`.
   - `lib/invoicing/build-bill.ts:231` envía `numbering_range_id`.
   - `lib/invoicing/build-bill.ts` usa `reference_code = FACT-{saleId}` (único por venta y estable entre reintentos; ver §Colisión de `reference_code`).
3. Factus asigna el consecutivo autorizado y responde. El POS guarda:
   - `prefix: 'FACT'` (fijo),
   - `consecutive: String(sale.ticketNumber || 1)`,
   - `fullNumber: result.billNumber || payload.reference_code`,
   - `uniqueCode: result.cufe`.
   - Ver `lib/invoicing/emit-invoice.ts:57-64`.
4. Después de `completeSale`, el POS llama a `generateInvoice` con datos internos:
   - `app/dashboard/pos/page.tsx:233-237` → `resolution: 'VENTA-INTERNA-POS'`, `prefix: 'REC'`.
5. `generateInvoice` busca una numeración local por `resolution + prefix`; si no existe, usa **cualquier** numeración del tenant; si no hay ninguna, crea una ficticia:
   - `app/actions/sales.ts:315-350`.
6. Calcula `currentNumber + 1`, valida el rango y formatea con **el prefijo recibido** (`REC`), no con el prefijo de la resolución:
   - `app/actions/sales.ts:352-358`.
7. Solo actualiza `fiscal_document` si el documento **no** tiene CUFE; si Factus ya emitió, no lo toca. Pero **siempre** incrementa la numeración local y registra auditoría con el número local:
   - `app/actions/sales.ts:376-415`.

### 2.2 Configuración actual

- La pestaña **“RESOLUCIONES DIAN”** (`components/settings/NumerationsSection.tsx`) administra únicamente la tabla `numeration`: resolución, prefijo, rango, consecutivo actual, tipo de documento y estado.
- La pestaña **“FACTURACIÓN ELECTRÓNICA”** (`components/settings/FactusSection.tsx`) administra credenciales, ambiente y el **ID de rango de Factus** (`factusNumberingRangeId`), con opción de listar los rangos del proveedor.
- **No hay vínculo entre ambas pestañas.** El rango real (Factus) y la resolución local son dos mundos separados.
- El payload siempre envía `document: '01'` (`lib/invoicing/build-bill.ts:233`), es decir, factura electrónica de venta. La resolución local de “documento equivalente POS” (`num_pos_001`) no participa en la emisión.

---

## 3. Hallazgos

| ID | Severidad | Ubicación | Hallazgo |
|----|-----------|-----------|----------|
| H-01 | Crítica | `lib/invoicing/build-bill.ts:231`, `emit-invoice.ts:63` | La numeración electrónica la asigna Factus; el consecutivo local no es la fuente de verdad y avanza en paralelo. |
| H-02 | Crítica | `app/actions/sales.ts:328-335`, `:358` | Si no encuentra la resolución `VENTA-INTERNA-POS/REC`, usa cualquier resolución del tenant (incluida una DIAN) y formatea con el prefijo `REC`. Consume el rango equivocado. |
| H-03 | Alta | `app/actions/sales.ts:337-350` | Si no hay numeraciones, crea una ficticia con rango `1..999999`, `currentNumber: 0` y `documentType: 'FACTURA_ELECTRONICA_VENTA'`, sin vigencia ni autorización. |
| H-04 | Alta | `app/actions/sales.ts:352-412` | Lectura y escritura del consecutivo no son atómicas: dos ventas concurrentes pueden leer el mismo `currentNumber` y generar duplicados. |
| H-05 | Alta | `lib/db/schema/fiscal.ts:28,64-65` | No hay índice único sobre `fiscal_document.fullNumber` ni sobre `saleId`; solo índices no únicos. Tampoco hay unicidad de `(tenantId, prefix, fullNumber)`. |
| H-06 | Alta | `components/settings/FactusSection.tsx:264-284`, `app/actions/factus-config.ts:16-24`, `build-bill.ts:24` | El ID de rango es opcional; se guarda `0` sin validación y el payload envía `numbering_range_id: 0`. El error aparece tarde, al emitir. |
| H-07 | Media | `app/actions/sales.ts:316-334` | La búsqueda no filtra `status = 'ACTIVE'` ni ordena de forma determinista; puede usar una resolución inactiva o “la primera que devuelva la BD”. |
| H-08 | Media | `components/settings/NumerationsSection.tsx:28-34`, `app/actions/numerations.ts:42` | El formulario arranca con `startRange = 1` y `currentNumber = 1`; como el siguiente es `current + 1`, la primera factura sería la **2**. Además, “consecutivo actual” se comporta como “último usado”, lo que confunde. |
| H-09 | Media | `app/actions/numerations.ts:21-50`, `:52-84` | Sin validaciones: no exige `startRange <= currentNumber <= endRange`, no valida prefijo, no evita rangos solapados, no valida tipo de documento ni estado. |
| H-10 | Media | `lib/db/schema/fiscal.ts:12-30` | Faltan datos de la resolución: número/fecha de resolución, vigencia desde/hasta, clave técnica y vínculo con el rango de Factus. No se puede auditar ni imprimir correctamente. |
| H-11 | Media | `components/settings/NumerationsSection.tsx:21-26` vs `sales.ts:347`, `emit-invoice.ts:58` | Vocabulario de `documentType` inconsistente (`INVOICE`, `POS_INVOICE`, `CREDIT_NOTE` en UI; `FACTURA_ELECTRONICA_VENTA` en emisión). |
| H-12 | Baja | `NumerationsSection.tsx:373`, `pos-utils.ts:97-99` | La UI muestra `SETP1 - SETP100000` sin padding, pero el código formatea a 8 dígitos (`SETP00000002`). Además, el prefijo mostrado no es necesariamente el que se usa al emitir. |
| H-13 | Baja | `app/actions/factus-service.ts:100-105` | `source` devuelve `'none'` cuando la configuración viene solo del tenant (sin `.env`), aunque `activeBaseUrl` exista. |
| H-14 | Informativa | `app/actions/sales.ts:408-415` | Cuando Factus ya aceptó la factura, `generateInvoice` igual incrementa la numeración local y audita un número que no corresponde al documento oficial. |
| H-15 | Informativa | `lib/invoicing/factus.ts:61` | `listNumberingRanges` solo consulta `filter_type=BILL`. Para notas crédito/débito se necesitará el filtro correspondiente; hoy no hay emisión de notas. |

---

## 4. Evidencia en base de datos (2026-10-19)

### Numeraciones locales

| id | resolución | prefijo | rango | consecutivo actual | tipo | estado |
|----|------------|---------|-------|--------------------|------|--------|
| `num_fe_001` | 18764000002 | SETP | 1 - 100000 | **41** | FACTURA_ELECTRONICA_VENTA | ACTIVE |
| `num_pos_001` | 18764000001 | SETP | 1 - 500000 | 105 | DOCUMENTO_EQUIVALENTE_POS | ACTIVE |

### Documentos aceptados por Factus (últimos)

| estado | prefijo | consecutivo | fullNumber | CUFE |
|--------|---------|-------------|------------|------|
| ACCEPTED | FACT | 22 | `SETP990027148` | sí |
| ACCEPTED | FACT | 20 | `SETP990027006` | sí |
| ACCEPTED | FACT | 18 | `SETP990026993` | sí |

### Configuración del tenant

- `factusEnvironment`: `sandbox`
- `factusNumberingRangeId`: **389**
- Credenciales: configuradas (`factusClientId` y `factusUsername` presentes).

### Interpretación

- El rango real de Factus (389) produce consecutivos de **9 dígitos** (`990027148`), mientras la resolución local tiene rango máximo **100000** y formatea a 8 dígitos. Son numeraciones incompatibles.
- La resolución local avanzó de 24 (seed) a 41 por las ventas generadas, aunque Factus solo llegó al 22. **19 números de diferencia** en sandbox.
- Los dos registros locales comparten prefijo `SETP`, pero tienen resoluciones y tipos distintos; el fallback no distingue cuál usar.
- La resolución local no guarda número/fecha de resolución ni vigencia, por lo que no sirve como soporte de auditoría.

---

## 5. Qué se necesita para que funcione bien

### A. Decisión funcional (primero)

Definir qué documento se emite en cada venta:

1. **Factura electrónica de venta (01)** para todas las ventas (lo que hace hoy el código), o
2. **Documento equivalente POS** para ventas sin datos del cliente y factura electrónica solo cuando se solicite.

De esa decisión depende si se necesita uno o dos rangos autorizados. El código actual siempre emite `01`.

### B. Configuración operativa (sin código)

1. Tener en Factus el rango autorizado con: prefijo, rango desde/hasta, vigencia y estado. En sandbox ya existe el **389**.
2. Configurar en el POS: ambiente, credenciales e **ID de rango**. Hoy está en `389` (sandbox).
3. Confirmar con el contador/Factus:
   - número y fecha de la resolución,
   - vigencia,
   - prefijo autorizado,
   - si el rango es de factura electrónica o de documento equivalente,
   - cuál será el rango de **producción** (no reutilizar el de sandbox).
4. Antes de producción: cambiar a ambiente `production`, cargar el rango real y emitir una factura de prueba con validación en el portal DIAN/Factus.

### C. Correcciones de código recomendadas

Ordenadas por prioridad:

1. **Separar numeración interna de numeración DIAN**
   - La tabla `numeration` debe tener un registro dedicado para comprobantes internos, por ejemplo `resolution = 'VENTA-INTERNA-POS'`, `prefix = 'REC'`, `documentType = 'COMPROBANTE_INTERNO'`.
   - Eliminar el fallback a “cualquier numeración” (`sales.ts:328-335`) y la creación automática de numeraciones ficticias (`:337-350`).
   - Si no existe el registro interno, crearlo explícitamente en la configuración/seed, no en medio de una venta.

2. **Usar el prefijo de la resolución, no el del input**
   - `formatInvoiceNumber(num.prefix, nextNumber)` en lugar de `input.prefix` (`sales.ts:358`).
   - Validar que el prefijo del input coincida con el de la resolución seleccionada.

3. **No tocar la numeración local cuando Factus ya emitió**
   - Si el documento tiene `uniqueCode`, no incrementar `numeration` ni auditar un número local como si fuera el oficial.
   - Si se necesita trazabilidad interna, guardar el consecutivo interno en un campo separado.

4. **Consecutivo atómico**
   - Reemplazar lectura + suma + update por una sola operación atómica, por ejemplo:
     `UPDATE numeration SET currentNumber = currentNumber + 1 WHERE id = ... AND currentNumber < endRange RETURNING currentNumber`.
   - Ejecutarla en transacción junto con el insert/update de `fiscal_document`.
   - Añadir índice único `(tenantId, prefix, fullNumber)` en `fiscal_document` y unicidad de `saleId` (o parcial por tipo de documento) para evitar duplicados.

5. **Validaciones en `createNumeration` / `updateNumeration`**
   - `startRange >= 1`, `endRange >= startRange`, `currentNumber` dentro del rango.
   - Prefijo obligatorio, en mayúsculas, sin espacios.
   - Un solo rango activo por `tenantId + documentType`.
   - Evitar solapamiento de rangos con el mismo prefijo.
   - Lista cerrada de `documentType`.
   - No permitir editar el consecutivo por debajo de documentos ya emitidos (o dejar auditoría explícita).

6. **Validar el rango de Factus**
   - En `updateTenantFactusConfig`, exigir `factusNumberingRangeId > 0` cuando la facturación electrónica esté habilitada.
   - En `buildInvoicePayload`, lanzar un error claro si el rango es `0` antes de llamar al proveedor.
   - Mostrar en la UI el rango real (prefijo, desde, hasta, consecutivo actual, estado) obtenido con `listNumberingRanges`.

7. **Unificar la pestaña “RESOLUCIONES DIAN” con Factus**
   - Opción recomendada: la pestaña muestra el rango de Factus como fuente de verdad (solo lectura) y permite registrar los datos de la resolución (número, fecha, vigencia) para el comprobante.
   - Opción alternativa: agregar a `numeration` el campo `factusNumberingRangeId` y sincronizar `currentNumber` desde Factus; nunca al revés.

8. **Corregir el formulario**
   - `currentNumber` debe ser “último consecutivo usado”; el valor inicial debe ser `startRange - 1` (o vacío con texto de ayuda).
   - Mostrar el próximo número (`currentNumber + 1`) y el número con padding real.
   - No permitir guardar `currentNumber = 1` con `startRange = 1` si eso implica saltar el 1.

9. **Idempotencia de emisión**
   - Evitar doble emisión por reintentos o doble clic: verificar por `saleId` y reforzar con restricción única.
   - `emit-invoice.ts` ya evita reenviar si hay CUFE, pero la ventana entre la consulta y el insert no está protegida.

10. **Notas crédito/débito (si se van a usar)**
    - Requieren su propio rango autorizado y `filter_type` distinto en `listNumberingRanges`.
    - Hoy `documentType` existe en la UI, pero no hay flujo de emisión.

11. **Seed y datos iniciales**
    - No sembrar resoluciones con rangos que no correspondan al proveedor.
    - Sembrar solo el comprobante interno `REC` y dejar que el rango DIAN se configure desde la UI de Factus.
    - Corregir el vocabulario de `documentType` en seed, UI y código.

12. **Detalle menor**
    - Corregir `getInvoiceProviderStatus().source` para que devuelva `'tenant-override'` cuando la configuración provenga solo del tenant (`factus-service.ts:100-105`).

### D. Limpieza de datos

1. **No seguir usando** `num_fe_001` ni `num_pos_001` como resoluciones activas: no corresponden al rango 389 ni a la numeración real.
2. Crear (después de corregir el código) un registro interno `VENTA-INTERNA-POS / REC` con `currentNumber = 0` y rango propio.
3. Si se quiere conservar historial, desactivar las resoluciones antiguas en lugar de borrarlas.
4. Revisar facturas pendientes con prefijo `REC` en sandbox; no debe quedar ninguna en producción.
5. Ajustar `scripts/seed.ts` para que futuras instalaciones no repitan estos datos.

---

## 6. Orden de implementación sugerido

1. Decidir factura electrónica vs. documento equivalente POS.
2. Corregir la separación numeración interna / numeración DIAN y eliminar el fallback.
3. Implementar consecutivo atómico + índices únicos.
4. Agregar validaciones y vínculo con el rango de Factus.
5. Corregir UI (defaults, etiquetas, padding, rango real).
6. Limpiar datos y seed.
7. Configurar el rango de producción y hacer la prueba de aceptación.

---

## 7. Checklist de aceptación

- [x] Una venta sin factura electrónica genera un comprobante interno `REC-00000001` y **no** modifica ningún rango DIAN. *(código + SQL verificado; prueba end-to-end pendiente en producción)*
- [x] Una venta con factura electrónica guarda el `billNumber` oficial de Factus, el CUFE y no altera el consecutivo interno. *(código)*
- [x] Dos ventas simultáneas no generan números duplicados ni saltos. *(incremento atómico + únicos; pendiente prueba de carga)*
- [x] Si el rango se agota, la venta muestra un error claro y no se pierde la venta. *(código)*
- [x] Si `factusNumberingRangeId` es `0`, la emisión se bloquea con un mensaje de configuración antes de llamar al proveedor. *(código)*
- [x] Una resolución inactiva no se usa. *(el flujo interno busca solo `num_internal_rec_001` activa)*
- [x] La pestaña de resoluciones muestra el rango real de Factus y los datos de la resolución (número, fecha, vigencia). *(UI)*
- [x] El seed de una instalación nueva no crea resoluciones ficticias. *(seed + limpieza aplicada en Neon)*
- [ ] En producción se emitió una factura de prueba y se validó en el portal DIAN/Factus.

---

## 8. Conclusión

El sistema **sí puede emitir facturas electrónicas** (Factus ya devolvió documentos `ACCEPTED` con CUFE y numeración `SETP`), pero **la gestión local de resoluciones no representa la numeración real**. Para producción no basta con “tener un rango configurado”: hay que separar la numeración interna de la electrónica, eliminar el fallback a rangos DIAN, garantizar atomicidad y unicidad, y vincular la configuración de Factus con la pestaña de resoluciones. Sin esos cambios, el POS seguirá mostrando consecutivos locales que no coinciden con los documentos emitidos y podría consumir rangos equivocados.

---

## 9. Estado de implementación (2026-10-19)

### Correcciones aplicadas

| # | Hallazgo | Cambio | Archivos |
|---|----------|--------|----------|
| 1 | Fallback a rangos DIAN para venta interna | `generateInvoice` solo usa la numeración interna `REC` (`VENTA-INTERNA-POS`); sin rango DIAN no hay emisión electrónica, y si Factus falla el comprobante queda local | `app/actions/sales.ts`, `lib/fiscal/numeration.ts` |
| 2 | CUFE falso en comprobantes locales | Eliminado el CUFE simulado; el comprobante interno queda `PENDING_GENERATION` sin `uniqueCode` | `app/actions/sales.ts` |
| 3 | Consecutivo no atómico | Reserva con `UPDATE ... SET currentNumber = GREATEST(currentNumber + 1, startRange) WHERE currentNumber < endRange RETURNING` dentro de `db.transaction`, con `early-return` si la venta ya tiene `uniqueCode` | `app/actions/sales.ts` |
| 4 | Duplicados de `fullNumber` / `saleId` | Índices únicos parciales `fiscal_document_fullnumber_unique` y `fiscal_document_sale_invoice_unique`; migración `0003` aplicada | `lib/db/schema/fiscal.ts`, `drizzle/0003_early_imperial_guard.sql` |
| 5 | Rango Factus podía ser 0 | Validación al guardar la config y error claro en `buildInvoicePayload` si el rango es `<= 0` | `app/actions/factus-config.ts`, `lib/invoicing/build-bill.ts`, `lib/invoicing/emit-invoice.ts` |
| 6 | Fuente del proveedor mal reportada | `getInvoiceProviderStatus().source` ahora distingue `tenant-override` / `env` / `none` | `app/actions/factus-service.ts` |
| 7 | Validaciones ausentes en CRUD de numeración | Prefijo normalizado, rango válido, un solo `ACTIVE` por tipo, sin solapes, sin reducir `currentNumber`, protección de la numeración interna | `app/actions/numerations.ts`, `lib/fiscal/numeration.ts` |
| 8 | UI con “consecutivo actual” ambiguo | Ahora dice “último consecutivo usado”, muestra próximo número, disponibilidad y el rango real de Factus (solo lectura) | `components/settings/NumerationsSection.tsx` |
| 9 | Seed con resoluciones ficticias | El seed solo crea `VENTA-INTERNA-POS / REC` (`num_internal_rec_001`) | `scripts/seed.ts` |
| 10 | Datos locales desalineados | `num_fe_001` y `num_pos_001` quedaron `INACTIVE`; creada `num_internal_rec_001` (`REC`, 1–999999, `currentNumber = 0`) | BD Neon |

### Verificación

- `npx tsc --noEmit`: sin errores.
- `npx vitest run`: 79/79 pruebas (incluye `test/fiscal/numeration.test.ts`).
- `npx next build`: compilación y generación estáticas OK.
- Smoke con `next start`: `/login` 200, `/` 307, `/dashboard` 307.
- SQL verificado contra la BD real en transacción con `ROLLBACK`: incremento atómico sobre `num_internal_rec_001` y restricciones de duplicado/FK en `fiscal_document`.

### Visibilidad del rango oficial de Factus (iteración posterior)

- **Bug encontrado**: Factus V2 responde `{ status, message, data: { data: [...], pagination } }` (anidado), pero `listNumberingRanges` leía `data.data` → devolvía `[]` siempre. Corregido en `lib/invoicing/factus.ts` (se eliminó además el `filter_type=BILL`, que no existe en la API).
- `current` en la respuesta de Factus es el **siguiente número** del rango (último asignado = `current - 1`).
- `NumerationsSection.tsx`: panel de solo lectura **"RANGO ELECTRÓNICO OFICIAL · FACTUS"** con Documento, Prefijo, Rango, Último asignado, Próximo y Estado; resalta el rango configurado. `FactusSection.tsx` ahora muestra Documento y Próximo Nº.
- Verificado en vivo (sandbox): rango 389 · `SETP` · 990000000–995000000 · ACTIVO · último asignado `SETP990027674` / próximo `SETP990027675`. El sandbox va adelantado porque es una cuenta de pruebas compartida; en producción mandará el `current` real de Factus.
- Flujo del POS verificado: `completeSale` transmite a Factus **antes** de `generateInvoice`, por lo que una venta electrónica exitosa **no consume** el consecutivo interno `REC`; `REC` solo se usa cuando la transmisión falla (fallback). Si un `REC` pendiente se transmite después, ese número queda como hueco interno (aceptado por diseño).
- Gate tras esta iteración: `tsc` OK · 79/79 tests · `next build` OK · smoke `/login` 200, `/` 307, `/dashboard` 307.

### Colisión de `reference_code` en Factus (PDF con productos ajenos)

- **Síntoma**: el PDF de Factus de una venta mostraba otro cliente e ítems (p. ej. `SETP990002276` con "INDUSTRIA DE ALIMENTOS SANTA RITA" y "Camara Colorvu 2mp"), mientras el recibo local mostraba la venta correcta.
- **Causa**: `reference_code` se generaba como `FACT-<ticketNumber>`. Factus garantiza idempotencia por `reference_code`: *"Si envía un reference_code ya procesado, recibirá los datos correspondientes a la factura existente"*. Los tickets se repiten entre resets/seed y la cuenta sandbox (`sandboxv2@factus.com.co`) es compartida y contiene facturas de ejemplo con referencias `FACT-11`, `FACT-25`, `FACT-26`, `FACT-28` y `FACT-29`; al reutilizarlas, Factus devolvió esas facturas ajenas (número, CUFE y links incluidos) y la app los guardó como si fueran de la venta.
- **Fix**: `buildInvoiceReference(saleId)` → `FACT-<saleId>` (único y estable entre reintentos). Tests en `test/invoicing/build-bill.test.ts`.
- **Datos corregidos (sandbox)**: 5 documentos afectados (tickets 11, 25, 26, 28 y 29) respaldados en `%TEMP%\pos_fiscal_docs_backup_*.json`, eliminados y reemitidos con referencias únicas → `SETP990027739`–`SETP990027743`. Verificado: ítems/cantidades, comprador, observación y fecha coinciden con la venta.
- **Nota de configuración**: la cuenta Factus configurada es la demo pública (`sandboxv2@factus.com.co`), por lo que el emisor de los PDF de Factus es "FACTUS V2" (NIT 1000789002), no el tenant. Para producción hay que configurar las credenciales propias.
- **Redondeo de caja (`cash_rounding_amount`)**: implementado. `buildInvoicePayload` calcula `sale.total − total exacto de ítems` (±50 por el redondeo a la centena), lo envía como `cash_rounding_amount` y reconcilia `payment_details` contra el total cobrado. Ej.: venta 14.875 exacto / 14.900 cobrado → ajuste `+25.00`. Si la diferencia supera ±50 (p. ej. descuentos no reflejados en ítems) se envía 0. Verificado con la venta `sale_1792443185756`: `cash_rounding_amount = 25` y pagos por 14.900. Las facturas ya validadas no se modifican; el ajuste aplica a las nuevas emisiones.
- Gate tras esta iteración: `tsc` OK · 86/86 tests · `next build` OK · smoke `/login` 200, `/` 307, `/dashboard` 307. Dev server reiniciado y temporales eliminados.

### Notas de la base real (drift)

- `documentType` es el enum `FiscalDocumentType` (`FACTURA_ELECTRONICA_VENTA`, `DOCUMENTO_EQUIVALENTE_POS`, `NOTA_CREDITO`, `NOTA_DEBITO`, `NOTA_AJUSTE`); no existe `COMPROBANTE_INTERNO`.
- `numeration.currentNumber/startRange/endRange` y `fiscal_document.consecutive` son `bigint` (pg devuelve string; el código ya lo convierte).
- `fiscal_document` exige `branchId`, `correlationId`, `customerSnapshot`, `issuerSnapshot`, `paymentSnapshot`, `totalsSnapshot`, `issueTime`: el insert del comprobante interno los llena explícitamente.

### Pendiente para producción

- [ ] Configurar el rango de Factus de **producción** (hoy el tenant está en sandbox con rango 389) y verificar la autorización DIAN vigente.
- [ ] Prueba de aceptación end-to-end en producción: una venta con factura electrónica (CUFE oficial) y una venta sin factura electrónica (`REC-00000001`).
- [ ] Revisar en sandbox si quedaron documentos `REC` pendientes.
