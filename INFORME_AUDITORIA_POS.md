# Informe de auditoría técnica del POS

**Fecha:** 2026-10-19  
**Repositorio auditado:** `pos-retail-y-dian`  
**Commit base:** `554615c`  
**Alcance:** inventario, reproducibilidad, integridad transaccional, idempotencia, integración fiscal Factus/DIAN, permisos multi-tenant, secretos, exactitud monetaria, caja, crédito, devoluciones, migraciones, backups, operación y pruebas de aceptación.  
**Naturaleza:** diagnóstico estático y verificación read-only. No se modificó código de aplicación, no se emitieron documentos fiscales, no se cobraron pagos y no se ejecutaron pruebas destructivas.

## 1. Resumen ejecutivo

El POS no es apto para producción en el estado auditado. Los bloqueantes principales son:

1. **Aislamiento multi-tenant incompleto:** un usuario autenticado de una empresa puede solicitar la emisión fiscal de una venta de otra si conoce el `saleId`; varias consultas y acciones devuelven datos globales o secretos.
2. **Cobro y cierre de venta no atómicos:** `completeSale` registra crédito, pagos, estado, inventario y emisión fiscal en escrituras independientes, sin transacción ni bloqueo. Un doble clic o una concurrencia puede duplicar efectos.
3. **Integridad fiscal insuficiente:** no existe bandeja durable/outbox, no hay reconciliación tras timeout ambiguo, un estado desconocido se normaliza a `ACCEPTED` y un fallo de persistencia posterior a DIAN deja el documento fuera de la base local.
4. **Datos fiscales incorrectos o incompletos:** `buildInvoicePayload` fuerza `NATURAL`, `legalOrganizationCode = '2'`, municipio `11001` y tributo `ZZ` para cualquier cliente con documento; un NIT termina con representación inconsistente. El pago a crédito se envía como efectivo.
5. **Crédito y caja permiten alterar saldos:** se aceptan montos negativos, se marcan cargos completos como pagados con abonos parciales y el efectivo esperado no considera egresos, retiros ni devoluciones.
6. **La UI presenta documentos internos como transmitidos/aceptados por DIAN:** la tabla y el visor XML rotulan `TRANSMITIDA (DIAN)` y `TRANSMITIDA Y ACEPTADA` con base en `isElectronicSent`, que también incluye `ISSUED`, y muestran XML ficticio cuando no existe XML firmado.
7. **Despliegue y recuperación no están resueltos:** el Dockerfile copia `.next/standalone` inexistente, el compose por defecto arranca modo desarrollo, no hay backups operativos ni healthcheck real de la aplicación.

**Recomendación de salida:** **NO APTO para producción**. Un piloto controlado solo sería aceptable con datos no fiscales, aislamiento corregido y emisión fiscal deshabilitada o ejecutada en sandbox con reconciliación manual auditada.

**Limitación principal:** la mayoría de hallazgos son inspección estática y consultas read-only a una base local con un solo tenant. No se ejecutaron T01-T14, no se probó concurrencia real, no se ejecutó `docker build`, no se ejecutó `npm ci` y no se consultó documentación oficial vigente de Factus/DIAN en esta sesión. No se atribuye cumplimiento DIAN integral a ningún build ni respuesta HTTP.

### Conteo de la matriz

| Estado | Secciones |
|---|---:|
| CUMPLE | 1 (C15, solo entregable de auditoría) |
| PARCIAL | 1 (C01) |
| NO CUMPLE | 13 |
| NO VERIFICABLE | 0 |
| NO APLICA | 0 |

El conteo no es un porcentaje de preparación; solo resume la matriz de controles de la sección 3.

## 2. Diseño real y discrepancias frente a la arquitectura documentada

| Tema | Documento de referencia | Implementación observada | Efecto |
|---|---|---|---|
| Base de datos | Base master y una base por tenant | Una sola base compartida; `lib/db/index.ts` exporta un único pool y esquema | Los controles de pools/migraciones por tenant no aplican al runtime actual; el aislamiento depende de filtros por `tenantId` |
| Tablas | 30 tablas | 35 tablas en la base auditada | Documentación desactualizada |
| Tests | 70 tests | 86 tests en 8 archivos | Documentación desactualizada |
| PostgreSQL | Docker | PostgreSQL 18.1 local, base `pruebas_POS` | El compose productivo no representa el entorno auditado |
| Multi-DB | `tenant-connection.ts` / provisioner | Existen, pero no se usan en las rutas principales; `default` cae en master | No hay aislamiento físico por empresa |
| Factus | Integración fiscal | Factus V2, cuenta sandbox/demo; el PDF observado es emitido por “FACTUS V2”, no por el tenant | No confundir con validación DIAN ni con emisión a nombre de la empresa |
| Migraciones | Drizzle controlado | Hay drift real: enums y columnas difieren de `0000`; `0001` elimina tablas que sí existen; `0003` solo agrega índices | Riesgo de despliegue/restauración |
| API keys | Según schema | La tabla `api_key` no existe en la base auditada | El flujo de API pública no es verificable |
| Informe fiscal previo | `INFORME_RESOLUCIONES_DIAN.md` | Describe un fallback a “cualquier numeración” que el código actual ya no usa; el código actual crea una numeración interna dedicada | El informe fiscal untracked no debe usarse como evidencia vigente sin actualizarlo |

El documento `CHECKLIST_AUDITORIA_POS.md` es contexto de control, no evidencia de implementación. La fuente de verdad usada fue el código y la base auditada.

## 3. Matriz de controles

| ID | Control | Estado | Severidad | Evidencia principal | Prueba asociada |
|---|---|---|---|---|---|
| C01 | Inventario, dependencias y reproducibilidad | PARCIAL | Alta | Lockfile, typecheck, tests y build pasan; `lint` roto; Docker standalone inválido; documentación desactualizada | Comandos de sección 5 |
| C02 | Atomicidad de venta, pagos, inventario y caja | NO CUMPLE | Crítica | `completeSale` sin transacción; stock global por producto; pago/venta separados | T01-T03, T10 |
| C03 | Idempotencia del cobro y cierre | NO CUMPLE | Crítica | No hay clave de operación ni unicidad; lectura de estado sin lock | T01 |
| C04 | Integración fiscal e idempotencia ante fallos | NO CUMPLE | Crítica | `existingDocs` sin orden; `mapFiscalStatus` desconocido a `ACCEPTED`; sin reconciliación | T04, T09, T13 |
| C05 | Trabajos persistentes y recuperación | NO CUMPLE | Crítica | No hay outbox/worker durable; emisión automática con `await` y error capturado | T05, T09 |
| C06 | Ticket interno, factura electrónica y equivalente POS | NO CUMPLE | Crítica | UI rotula como DIAN; XML ficticio; numeración local y proveedor desacoplados | Revisión UI |
| C07 | Autenticación, permisos y aislamiento tenant | NO CUMPLE | Crítica | `emitSaleElectronicInvoice` no valida tenant de la venta; `getUsersList`/`listAllTenants` globales | T06-T08 |
| C08 | Secretos, errores y privilegios | NO CUMPLE | Crítica | Secretos DIAN devueltos en fila de tenant; passwords directos; auditoría con password | Revisión de acciones/config |
| C09 | Exactitud monetaria, pagos y caja | NO CUMPLE | Crítica | Descuento no aplicado al total; tolerancia 100; pago de crédito como efectivo; caja sin egresos | T10 |
| C10 | Devoluciones, notas crédito y crédito interno | NO CUMPLE | Alta | No hay devoluciones/notas crédito; crédito acepta negativos y abona mal cargos | T11 |
| C11 | Bases por empresa y migraciones | NO CUMPLE | Alta | Runtime de BD única; drift de schema; provisioner no aplicado en flujo normal | T12, T14 |
| C12 | Backups y conservación documental | NO CUMPLE | Alta | No hay backups operativos, RPO/RTO ni restauración; paquete no integrado | T12 |
| C13 | Monitoreo, despliegue y operación offline | NO CUMPLE | Alta | Sin healthcheck real, alertas, despliegue reversible ni offline probado | Revisión operativa |
| C14 | Matriz de pruebas de aceptación | NO CUMPLE | Alta | Solo tests unitarios; T01-T14 no ejecutadas | T01-T14 |
| C15 | Entregables de auditoría | CUMPLE | N/A | Este informe contiene resumen, inventario, matriz, hallazgos, comandos, plan y criterios | N/A |

## 4. Hallazgos detallados

### F-01. Emisión fiscal cross-tenant y fuga de datos entre empresas

- **Tipo:** defecto confirmado.
- **Estado/severidad:** abierto, crítica (P0).
- **Archivo/símbolo/líneas:** `lib/invoicing/emit-invoice.ts:14-20` (`emitSaleElectronicInvoice`); `app/actions/factus-service.ts:10-18`; `app/actions/users.ts:10-35` (`getUsersList`); `app/actions/tenants.ts:184-196` (`listAllTenants`); `app/actions/company.ts:10-18` (`getCompanyInfo`); `app/api/reports/inventory-pdf/route.ts`.
- **Evidencia observada:** la emisión busca la venta solo por `id`, sin `tenantId`; la acción valida el rol del usuario, pero no que la venta pertenezca a su tenant. `getUsersList` hace un `leftJoin` global de `user_tenant`; `listAllTenants` permite a un ADMIN listar todos los tenants con `select()` completo; `getCompanyInfo` devuelve la fila completa del tenant, incluidos campos DIAN/Factus. El PDF de inventario resuelve un `locationId` sin comprobar tenant.
- **Escenario de fallo o abuso:** un CASHIER/MANAGER de A conoce o adivina un `saleId` de B y ejecuta `emitFactusElectronicInvoice`; se usa la configuración fiscal de B, se emite y se persiste el documento de B. Un ADMIN de A enumera usuarios/empresas y obtiene metadatos y secretos almacenados.
- **Prueba ejecutada y resultado:** inspección estática; no se ejecutó T06/T07 porque requeriría segundo tenant y evitaría efectos fiscales. La base solo tiene un tenant.
- **Limitaciones:** no se creó un segundo tenant ni se intentó acceso real.
- **Corrección mínima:** derivar siempre el tenant de `requireTenantId` y añadir `and(eq(sale.id, saleId), eq(sale.tenantId, tenantId))`; no aceptar `X-Tenant-ID` como autoridad; filtrar por tenant en cada join, descarga y agregación; no devolver secretos en DTOs; separar vistas públicas de vistas administrativas.
- **Criterio de aceptación:** T06/T07 denegados en servidor con 403/404 sin filtrar existencia; un usuario de A no puede leer ni emitir nada de B; los DTOs no contienen secretos.

### F-02. `completeSale` no es atómico y permite duplicar una venta

- **Tipo:** defecto confirmado.
- **Estado/severidad:** abierto, crítica (P0).
- **Archivo/símbolo/líneas:** `app/actions/sales.ts:197-298`; `app/actions/sales.ts:23-176` (`createSale`); `app/actions/sales.ts:219-241` (crédito); `app/actions/sales.ts:243-285` (pagos/estado/inventario); `app/actions/sales.ts:290-295` (emisión).
- **Evidencia observada:** se lee la venta, se comprueba `DRAFT`, se registra crédito, se insertan pagos, se actualiza la venta, se descuenta inventario y se emite la factura como pasos independientes. No hay transacción, `SELECT ... FOR UPDATE`, `WHERE status = 'DRAFT'` condicional ni clave de idempotencia. `createSale` también inserta venta e ítems sin transacción.
- **Escenario de fallo o abuso:** dos solicitudes simultáneas pasan la comprobación de estado; ambas registran pagos y stock. Un fallo tras el pago deja pago sin venta cerrada, o crédito sin venta. Un fallo tras completar la venta deja inventario/emisión inconsistentes. Un doble clic es suficiente en la práctica.
- **Prueba ejecutada y resultado:** no ejecutada; T01/T03 requieren concurrencia/fallo inyectado y efectos de pago. Inspección estática confirma ausencia de transacción.
- **Limitaciones:** no se realizaron ventas ni pagos reales.
- **Corrección mínima:** una transacción única con la misma conexión para venta, ítems, pagos, inventario, caja y crédito; bloqueo/actualización condicional de estado; clave idempotente persistida; efectos externos (Factus) fuera de la transacción y con outbox.
- **Criterio de aceptación:** T01 produce una venta y un conjunto de pagos/stock/cargos; T03 revierte todo; dos cobros concurrentes no duplican.

### F-03. Numeración de ticket no es única bajo concurrencia

- **Tipo:** defecto confirmado.
- **Estado/severidad:** abierto, alta (P1).
- **Archivo/símbolo/líneas:** `app/actions/sales.ts:69-75`; `lib/db/schema/sales.ts:49` (sin `unique`).
- **Evidencia observada:** el ticket se calcula como `max(ticketNumber) + 1` sin bloqueo y la columna no tiene índice único. `generateInvoice` sí reserva el consecutivo interno con una actualización atómica, pero el ticket comercial no.
- **Escenario de fallo o abuso:** dos cajas crean ventas simultáneas y reciben el mismo `ticketNumber`; la UI muestra dos “FACT-#0001”.
- **Prueba ejecutada y resultado:** no ejecutada; T02 requiere dos requests concurrentes.
- **Limitaciones:** no se forzó concurrencia real.
- **Corrección mínima:** secuencia por tenant o `UPDATE ... RETURNING` con tabla de contador y restricción única `(tenantId, ticketNumber)`; reintento explícito ante colisión.
- **Criterio de aceptación:** dos creaciones concurrentes reciben números distintos y la BD rechaza duplicados.

### F-04. Idempotencia fiscal incompleta y estados peligrosos

- **Tipo:** defecto confirmado.
- **Estado/severidad:** abierto, crítica (P0).
- **Archivo/símbolo/líneas:** `lib/invoicing/emit-invoice.ts:29-49` (búsqueda existente), `:54-119` (persistencia), `:108-118` (fallo de BD); `lib/catalogs/dian-status.ts:29-35`; `lib/invoicing/factus.ts:122-142`; `lib/db/schema/fiscal.ts:38-75`.
- **Evidencia observada:** la búsqueda existente usa `limit(1)` sin orden y puede seleccionar un documento no representativo; no hay reconciliación por `reference_code` ni consulta al proveedor tras timeout. `mapFiscalStatus` convierte valores desconocidos o vacíos a `ACCEPTED`. Factus se considera exitoso con `res.ok && (cufe || id)`, sin exigir CUFE. Si DIAN acepta y falla la escritura local, se retorna un resultado exitoso con advertencia, sin outbox ni reintento durable. Existe índice único parcial por `saleId` para factura electrónica y por número, pero no una clave de idempotencia de la operación de cobro.
- **Escenario de fallo o abuso:** timeout después de que Factus procesó; reintento genera otra emisión lógica o deja un documento local ausente. Estado no reconocido se presenta como aceptado. Dos emisiones concurrentes compiten por la misma venta y actualizan el registro de forma no determinista.
- **Prueba ejecutada y resultado:** no ejecutada; T04/T05/T09 requieren mocks de timeout/concurrencia. La prueba unitaria `test/catalogs/dian-status.test.ts:40-45` **codifica el comportamiento peligroso** y pasa.
- **Limitaciones:** no se llamó a Factus ni se simularon timeouts.
- **Corrección mínima:** estado interno separado del estado fiscal; desconocido => `PENDING`/error, nunca `ACCEPTED`; persistir intención y outbox en la misma transacción de la venta; worker durable con lease, reintentos y reconciliación; consultar por `reference_code` antes de reenviar; almacenar XML/PDF de forma durable y verificable.
- **Criterio de aceptación:** T04 no crea un segundo documento; T05/T09 recuperan sin duplicar; un estado desconocido no se muestra como aceptado.

### F-05. Payload fiscal no representa correctamente al cliente ni al pago

- **Tipo:** defecto confirmado.
- **Estado/severidad:** abierto, crítica (P0).
- **Archivo/símbolo/líneas:** `lib/invoicing/build-bill.ts:239-300`; `lib/invoicing/factus-mappers.ts:44-77`, `:80-122`; `lib/invoicing/factus.ts:99-157`.
- **Evidencia observada:** `buildInvoicePayload` construye al cliente desde el snapshot de la venta con `personType: 'NATURAL'`, `legalOrganizationCode: '2'`, `identificationDocumentCode: null`, `municipalityCode: '11001'` y `tributeCode: 'ZZ'`, incluso si el documento es NIT. `buildCustomerPayload` no fuerza esos valores por sí mismo, pero el caller sí los impone. El pago a crédito se envía con `payment_form: '1'` (“efectivo”) en `toPaymentDetail`; `mapTax` usa siempre código `01` y marca tasa 0 como excluida. `buildPayments` ajusta el pago al total de factura, no al total pagado si hay descuento.
- **Escenario de fallo o abuso:** se emite una factura a una empresa con NIT pero con tipo de persona/organización inconsistente, municipio fijo y sin código de documento; el comprador puede rechazar el documento. Un pago a crédito queda declarado como efectivo.
- **Prueba ejecutada y resultado:** inspección estática; no se emitió. Los tests de `build-bill` y `factus-mappers` pasan, pero no cubren un cliente NIT real ni un pago a crédito contra el contrato Factus.
- **Limitaciones:** no se validó con documentación oficial vigente de Factus/DIAN ni con sandbox.
- **Corrección mínima:** cargar el cliente desde `customer` y mapear `personType`, `legalOrganizationCode`, `identificationDocumentCode`, municipio y tributo según tipo de documento; no usar defaults para NIT; modelar descuentos y pagos reales; mapear forma de pago de crédito correctamente; añadir pruebas de contrato.
- **Criterio de aceptación:** un NIT produce `31`, organización `1` (o el código aplicable), documento y municipio configurados; el total de `payment_details` concilia con el total pagadero; pruebas de payload para NIT, consumidor final, crédito, split y descuento.

### F-06. El ticket interno y el visor XML se presentan como documentos DIAN

- **Tipo:** defecto confirmado.
- **Estado/severidad:** abierto, alta (P1).
- **Archivo/símbolo/líneas:** `components/invoices/InvoiceTable.tsx:227-255`; `app/dashboard/invoices/page.tsx:181-193`, `:214-216`; `components/invoices/XmlAuditModal.tsx:25-95`; `components/invoices/InvoiceTicketModal.tsx:19`, `:51-62`, `:151`, `:205-206`.
- **Evidencia observada:** la tabla muestra “TRANSMITIDA (DIAN)” cuando `isElectronicSent` es verdadero; `getAllInvoices` lo calcula para `ISSUED` o `ACCEPTED` (`app/actions/invoices.ts:138`). El modal XML afirma “FACTURA TRANSMITIDA Y ACEPTADA” solo con `isElectronicSent` y, si no hay XML, renderiza un XML UBL ficticio con fecha y emisor hardcodeados. El CSV rotula “TRANSMITIDA DIAN”. El ticket usa “FACTURA” y “IVA (19% IMPUESTO)” aunque el documento sea interno.
- **Escenario de fallo o abuso:** un usuario u operador cree que el recibo local está validado por DIAN; se entrega al cliente un comprobante con apariencia fiscal sin CUFE válido, y el XML mostrado no corresponde al documento real.
- **Prueba ejecutada y resultado:** inspección estática; no se abrió el modal con datos reales.
- **Limitaciones:** no se ejecutó una prueba visual/e2e.
- **Corrección mínima:** separar explícitamente `REC` interno, `FACTURA_ELECTRONICA` y `DOCUMENTO_EQUIVALENTE_POS`; no mostrar “DIAN/ACEPTADA” sin estado fiscal y CUFE verificados; no fabricar XML; mostrar un enlace al XML/PDF real o un estado vacío; usar el IVA real del documento.
- **Criterio de aceptación:** un documento interno nunca muestra “DIAN/ACEPTADA”; un documento `ISSUED` no se muestra como aceptado; el XML mostrado coincide con el archivo firmado o no se muestra.

### F-07. Exposición de secretos, passwords y auditoría sensible

- **Tipo:** defecto confirmado.
- **Estado/severidad:** abierto, crítica (P0).
- **Archivo/símbolo/líneas:** `app/actions/company.ts:10-18`, `:199-251`; `app/actions/users.ts:40-90`; `app/actions/tenants.ts:106-140`; `app/actions/_shared.ts:15-32`; `lib/security/encrypt.ts:23-40`.
- **Evidencia observada:** `getCompanyInfo` devuelve la fila completa del tenant, incluidos `dianPassword`, credenciales Factus y otros secretos; `updateCompanyInfo` persiste `dianPassword` y `logAudit(..., input)` guarda el input completo, incluido el password. `createUserAction` inserta `account` directo con `password: input.password || '12345678'` (`users.ts:71`), sin hashing; `createTenantWithAdmin` hace lo mismo. Better Auth exige mínimo 12 caracteres, pero estas rutas lo evitan. La base tiene 1 registro de auditoría con `password`. `encryptSecret` es AES-256-GCM correcto, pero no protege las rutas que no lo usan.
- **Escenario de fallo o abuso:** un ADMIN ve secretos DIAN/Factus en la respuesta de la Server Action; un atacante con acceso a auditoría obtiene un password; usuarios creados por la acción quedan con contraseña conocida o texto plano.
- **Prueba ejecutada y resultado:** inspección estática y consulta de conteo de auditoría; no se imprimieron valores.
- **Limitaciones:** no se probó la respuesta HTTP ni se intentó autenticar con la contraseña semilla.
- **Corrección mínima:** devolver solo campos no sensibles y placeholders; cifrar `dianPassword` o eliminarlo del modelo; hashear con Better Auth/scrypt en todas las altas; auditar solo metadatos redactados; invalidar/rotar credenciales expuestas.
- **Criterio de aceptación:** ninguna respuesta de Server Action contiene secretos; ninguna auditoría contiene passwords; todas las cuentas nuevas usan hashing y política de contraseña; pruebas de regresión de serialización.

### F-08. Inventario global, sin movimientos y con posibilidad de stock negativo

- **Tipo:** defecto confirmado.
- **Estado/severidad:** abierto, alta (P1).
- **Archivo/símbolo/líneas:** `app/actions/sales.ts:115-133` (consulta de stock), `:269-285` (descuento); `app/actions/inventory.ts:10-70`; `lib/db/schema/catalog.ts:40-58`.
- **Evidencia observada:** `createSale` consulta inventario solo por `productId` y sin `locationId`; `completeSale` descuenta todas las filas del producto en el tenant (`productId + tenantId`), no la ubicación de la venta. `getInventoryStats` hace `leftJoin` por producto sin ubicación y cuenta filas, duplicando totales si hay varias sedes. `recordInventoryMovement` no es transaccional, busca sin tenant, trata `ADJUSTMENT` como suma, permite negativos y puede crear inventario sin `branchId`.
- **Escenario de fallo o abuso:** una venta en la sede A descuenta stock de la sede B; dos cajas venden la última unidad; el reporte de inventario infla el número de productos.
- **Prueba ejecutada y resultado:** no ejecutada; T02 requiere concurrencia. Inspección y datos reales (300 filas de inventario para 100 productos) confirman múltiples filas por producto.
- **Limitaciones:** no se modificó stock.
- **Corrección mínima:** stock por `(tenantId, locationId, productId)`; transacción y `UPDATE ... WHERE quantity >= ? RETURNING`; política explícita para venta sin stock; registrar `inventory_movement` en la misma transacción; filtrar tenant en todas las consultas.
- **Criterio de aceptación:** T02 mantiene stock consistente; una venta solo afecta su sede; todo cambio tiene movimiento y auditoría.

### F-09. Caja y reportes Z no concilian efectivo, egresos ni devoluciones

- **Tipo:** defecto confirmado.
- **Estado/severidad:** abierto, alta (P1).
- **Archivo/símbolo/líneas:** `app/actions/z-report.ts:79-156`; `app/actions/cashier.ts:13-34`, `:36-77`, `:79-127`; `app/actions/sales.ts:197-298`.
- **Evidencia observada:** `expectedCash = openingBase + cashSales`; no considera gastos, retiros, devoluciones ni ajustes. `TRANSFER` se suma a `nequiSales` y se reporta como transferencia, pero `transferSales = nequiSales`; los métodos no reconocidos caen en `otherSales`/`creditSales`. Si no hay pagos, se asume que todas las ventas completadas son efectivo. `closeCashierSession` no valida que la sesión esté `OPEN`, no verifica ownership y puede cerrar una sesión ya cerrada. `openCashierSession` acepta `assignedUserId` arbitrario y solo permite una caja abierta por tenant.
- **Escenario de fallo o abuso:** el arqueo muestra un efectivo esperado distinto del real; un egreso no registrado parece faltante; una venta a crédito se clasifica como otro medio; un usuario cierra una caja ajena o dos veces.
- **Prueba ejecutada y resultado:** inspección estática; no se abrió/cerró caja.
- **Limitaciones:** no se ejecutó T10.
- **Corrección mínima:** modelo de movimientos de caja con ingresos/egresos/retiros/devoluciones; conciliación por método y por sesión; validar estado y ownership; bloquear cierre concurrente; no asumir efectivo cuando faltan pagos.
- **Criterio de aceptación:** T10 concilia efectivo, cambio, split y crédito; el cierre repetido falla de forma segura; egresos aparecen en el esperado.

### F-10. API pública y API keys no operativas o inseguras

- **Tipo:** defecto confirmado.
- **Estado/severidad:** abierto, alta (P1).
- **Archivo/símbolo/líneas:** `lib/api/public-api.ts:10-60`; `lib/security/rate-limit.ts:20-56`; `proxy.ts:20-78`; `app/api/v1/invoices/route.ts`; `lib/db/schema/platform.ts:9-29`.
- **Evidencia observada:** la tabla `api_key` no existe en la base auditada aunque el schema la define y `validateAPIKey` la consulta. Se ignora el prefijo de la key y solo se hashea el secreto; `rateLimitWindow` no se usa (ventana fija de 1 hora); el rate limit es fail-open. `proxy.ts` solo comprueba presencia de cookie/header, no validez ni tenant; `X-Tenant-ID` se acepta como dato del cliente. El endpoint `POST /api/v1/invoices` devuelve una factura fabricada sin persistencia; `GET` expone documentos completos.
- **Escenario de fallo o abuso:** el endpoint devuelve 500 por tabla ausente, o si se crea la tabla, una key con prefijo incorrecto sigue siendo válida; un atacante satura sin límite si la BD falla; un cliente puede solicitar datos con un tenant header no verificado.
- **Prueba ejecutada y resultado:** no se llamó al endpoint; la ausencia de tabla se confirmó en la base.
- **Limitaciones:** no se creó `api_key` ni se probó autenticación de API.
- **Corrección mínima:** migración real de `api_key`; validar prefijo + hash; usar `rateLimitWindow`; cerrar en fallo (fail-closed) o degradación explícita; resolver tenant desde la key, nunca desde header; no fabricar respuestas; imponer scopes y auditoría.
- **Criterio de aceptación:** key válida funciona, inválida/revocada/expirada falla; tenant se deriva de la key; rate limit responde 429; tablas y migraciones coinciden.

### F-11. No existe recuperación durable de emisiones fiscales

- **Tipo:** defecto confirmado.
- **Estado/severidad:** abierto, crítica (P0).
- **Archivo/símbolo/líneas:** `app/actions/sales.ts:290-295`; `lib/invoicing/emit-invoice.ts`; `lib/db/schema/fiscal.ts`; ausencia de worker/outbox en el repositorio.
- **Evidencia observada:** la emisión se ejecuta al final de `completeSale` con `await`, pero cualquier error se captura y solo se registra en consola. No hay `outbox_event` operativo (0 filas), ni worker, lease, reintentos, alertas o reconciliación. La venta queda completada aunque la factura no exista.
- **Escenario de fallo o abuso:** se completa la venta, Factus está caído o timeout, y no hay mecanismo que reintente; el usuario no ve un pendiente accionable; tras reinicio no se recupera.
- **Prueba ejecutada y resultado:** no ejecutada; T05/T09 requieren detener el proceso. Inspección confirma ausencia de bandeja durable.
- **Limitaciones:** no se forzó un fallo de Factus.
- **Corrección mínima:** intención fiscal + outbox en la transacción de venta; worker separado, idempotente, con lease y reintentos; estado visible y reintento autorizado; alertas.
- **Criterio de aceptación:** T05/T09 recuperan sin duplicar; una venta sin factura aparece como pendiente y es reintentable.

### F-12. Despliegue, migraciones y esquema presentan drift

- **Tipo:** defecto confirmado / riesgo.
- **Estado/severidad:** abierto, alta (P1).
- **Archivo/símbolo/líneas:** `Dockerfile:44-45`; `next.config.mjs:24-34`; `docker-compose.yml:1-50`; `docker-compose.override.yml:1-32`; `drizzle/0000_pale_skaar.sql`, `0001_bored_mephistopheles.sql`, `0003_early_imperial_guard.sql`; `lib/db/index.ts:5-13`.
- **Evidencia observada:** el Dockerfile copia `.next/standalone`, pero `next.config.mjs` no define `output: 'standalone'` y `.next/standalone` no existe tras el build. El compose por defecto se fusiona con `docker-compose.override.yml`, que usa `Dockerfile.dev` y `npm run dev`. La base real tiene 35 tablas y enums/columnas que no coinciden con `0000`; `0001` elimina tablas que existen; `0003` solo agrega índices. `db:push` está disponible y puede sustituir migraciones.
- **Escenario de fallo o abuso:** el contenedor productivo falla al copiar standalone; un despliegue “normal” arranca en desarrollo; una base nueva o restaurada no reproduce el esquema real.
- **Prueba ejecutada y resultado:** `.next/standalone` no existe; no se ejecutó `docker build`. Typecheck/build locales pasan.
- **Limitaciones:** no hay Docker disponible/ejecutado; no se aplicaron migraciones.
- **Corrección mínima:** añadir `output: 'standalone'`; construir y probar la imagen; separar compose prod/dev; generar migración de reconciliación y probar en base vacía y restaurada; bloquear `db:push` en producción.
- **Criterio de aceptación:** `docker build` y arranque OK; esquema desde cero == base auditada; migración reversible/recuperable; compose prod no usa dev.

### F-13. Backups y conservación documental no implementados

- **Tipo:** defecto confirmado.
- **Estado/severidad:** abierto, alta (P1).
- **Archivo/símbolo/líneas:** `packages/backup-recovery/src/backup-engine.ts`; `packages/backup-recovery/src/recovery-engine.ts`; ausencia de jobs/scripts de backup en `package.json` y despliegue.
- **Evidencia observada:** no hay backup automático, RPO/RTO, cifrado de respaldos, verificación de integridad ni restauración. El paquete `backup-recovery` no está importado por la aplicación y usa una clave por defecto hardcodeada y AES-256-CBC; no cumple el nivel del cifrado de secretos de la app.
- **Escenario de fallo o abuso:** pérdida de la base o del volumen; XML/PDF dependen de URLs del proveedor; no hay forma demostrada de recuperar acceso ni conciliar membresías.
- **Prueba ejecutada y resultado:** inspección; T12 no ejecutada.
- **Limitaciones:** no se ejecutó restauración.
- **Corrección mínima:** backups cifrados de master y datos fiscales, copia externa, retención, verificación, restauración ensayada y gestión de claves; no usar claves por defecto; conservar XML/PDF de forma durable.
- **Criterio de aceptación:** T12 restaura en entorno aislado con datos, accesos y documentos verificables; alertas por fallo.

### F-14. Monitoreo, healthchecks y offline son simulados o inexistentes

- **Tipo:** defecto confirmado / riesgo.
- **Estado/severidad:** abierto, media (P2).
- **Archivo/símbolo/líneas:** `packages/telemetry-analytics/src/health-checker.ts`; `app/api` (no hay health endpoint); `docker-compose*.yml`; `proxy.ts`.
- **Evidencia observada:** el health checker devuelve `HEALTHY` para SQLite, impresora, báscula y DIAN sin comprobar nada; no está integrado en la app. No hay endpoint de salud de aplicación, alertas por errores fiscales/pendientes/backups, ni procedimiento de reversión. El modo offline/Tauri no está probado y los paquetes `sync-engine`/`telemetry-analytics` no se importan en las rutas principales.
- **Escenario de fallo o abuso:** una caída de Factus, saturación de conexiones o backup fallido pasa desapercibido; se cree tener offline/impresora cuando no existe.
- **Prueba ejecutada y resultado:** inspección; no se ejecutó T09/T13.
- **Limitaciones:** no hay entorno Tauri ni periféricos.
- **Corrección mínima:** healthcheck real de app/BD/proveedor sin exponer secretos; logs estructurados con correlación y tenant; alertas; runbook de despliegue/reversión; declarar offline como no implementado.
- **Criterio de aceptación:** healthcheck falla cuando falla una dependencia; alertas se disparan; runbook probado en staging.

### F-15. Devoluciones y notas crédito no existen; crédito interno es inconsistente

- **Tipo:** defecto confirmado.
- **Estado/severidad:** abierto, alta (P1).
- **Archivo/símbolo/líneas:** `app/actions/customers.ts:236-415`; `lib/fiscal/numeration.ts:9-19`; ausencia de acciones/UI de devolución o nota crédito.
- **Evidencia observada:** no hay devolución total/parcial, restauración de stock, reverso de pago, nota crédito ni vínculo con el documento fiscal. El catálogo de numeración incluye `NOTA_CREDITO`, pero no se usa. `chargeCustomerCredit` no valida `amount > 0`; un monto negativo reduce la deuda y puede superar el cupo. `payCustomerCredit` acepta negativos y marca cargos completos como `PAGADO` aunque el abono sea parcial; no filtra por tenant en la consulta de cargos.
- **Escenario de fallo o abuso:** se “paga” con un abono negativo; un abono parcial desaparece la deuda completa; no se puede anular una venta sin borrar datos; no hay trazabilidad fiscal.
- **Prueba ejecutada y resultado:** inspección; T11 no ejecutada.
- **Limitaciones:** no se modificaron saldos.
- **Corrección mínima:** validar montos positivos; abonos con asignación parcial por cargo y saldo; transacción; devoluciones con autorización, stock y nota crédito; no borrar ventas/documentos; idempotencia.
- **Criterio de aceptación:** T11 no excede ni duplica; abono parcial deja saldo correcto; nota crédito vinculada y trazable.

### F-16. Ticket y exportaciones usan IVA fijo y etiquetas fiscales ambiguas

- **Tipo:** defecto confirmado.
- **Estado/severidad:** abierto, media (P2).
- **Archivo/símbolo/líneas:** `components/invoices/InvoiceTicketModal.tsx:151`; `app/dashboard/invoices/page.tsx:181`; `components/invoices/InvoiceTable.tsx:237`.
- **Evidencia observada:** el ticket muestra “IVA (19% IMPUESTO)” aunque las líneas tengan tasas 0/5/19; el CSV rotula “IVA 19%”; la tabla usa “FACTURACIÓN ELECTRÓNICA (DIAN)” para todos los documentos.
- **Escenario de fallo o abuso:** el cliente recibe un comprobante con un IVA que no corresponde; el reporte exportado induce a error contable.
- **Prueba ejecutada y resultado:** inspección; no se generó PDF/CSV.
- **Limitaciones:** no se probó impresión.
- **Corrección mínima:** calcular y mostrar el IVA real por línea/total; etiquetas por tipo de documento; pruebas de ticket con tasas mixtas.
- **Criterio de aceptación:** ticket y CSV reflejan exactamente los impuestos del documento.

### F-17. Tests y documentación no cubren los riesgos y algunos codifican defectos

- **Tipo:** defecto de aseguramiento.
- **Estado/severidad:** abierto, media (P2).
- **Archivo/símbolo/líneas:** `test/catalogs/dian-status.test.ts:40-45`; `test/invoicing/build-bill.test.ts`; `test/invoicing/factus-mappers.test.ts`; `ARQUITECTURA_POS_DIAN_COLOMBIA.md`; `INFORME_RESOLUCIONES_DIAN.md`.
- **Evidencia observada:** no hay tests de integración, concurrencia, auth/tenant, contratos Factus, caja, inventario, devoluciones, backups ni T01-T14. El test de estados exige que un valor desconocido sea `ACCEPTED`. Los tests de build-bill/mappers no cubren NIT, pago a crédito, descuento ni reconciliación. La arquitectura documentada no coincide con la implementación y el informe fiscal untracked contiene afirmaciones desactualizadas sobre el fallback de numeración.
- **Escenario de fallo o abuso:** los bugs críticos pasan CI; un cambio futuro puede “romper” el comportamiento correcto porque el test espera el defectuoso.
- **Prueba ejecutada y resultado:** `npm test` 86/86, todos unitarios; no cubren los hallazgos.
- **Limitaciones:** no hay CI configurado.
- **Corrección mínima:** tests de integración con Postgres efímero, concurrencia real, mocks de Factus, matriz auth/tenant y aceptación T01-T14; corregir la expectativa de estado desconocido; actualizar documentación.
- **Criterio de aceptación:** T01-T14 automatizadas o documentadas con evidencia; CI bloquea regresiones críticas.

## 5. Comandos ejecutados y resultados reales

| Comando | Resultado |
|---|---|
| `node --version` | `v22.23.3` |
| `npm --version` | `10.9.9` |
| `git log -1 --oneline` | `554615c fix(pos): muestra factura realizada con exito en ventas sin facturacion electronica` |
| `npm run typecheck` | EXIT=0 |
| `npm test` | 8 archivos, 86 tests, EXIT=0 |
| `npm run build` | EXIT=0; Next 16.2.6; 22 rutas generadas |
| `npm run lint` | EXIT=1; `eslint` no está instalado/configurado |
| `Test-Path .next/standalone` | `False` |
| Dev server (`/login`) | HTTP 200 |
| Consultas read-only a PostgreSQL | 35 tablas; 1 tenant; 21 documentos fiscales; `api_key` ausente; `paymentSnapshot` con diferencia >1 en 19/21; 1 auditoría con `password` |
| `git status --short` | Cambios fiscales previos y archivos untracked; no se modificó código durante la auditoría |

No se ejecutaron: `npm ci`, `docker build`, `docker compose`, T01-T14, pruebas de concurrencia, emisión Factus/DIAN, cobros, devoluciones, restauración de backups ni pruebas Tauri/periféricos.

## 6. Pruebas de aceptación: estado

| ID | Estado | Motivo |
|---|---|---|
| T01 | NO EJECUTADA | Requiere cobro concurrente y efectos reales; defecto estático ya confirmado |
| T02 | NO EJECUTADA | Requiere concurrencia de stock; no se modificó inventario |
| T03 | NO EJECUTADA | Requiere inyección de fallo transaccional |
| T04 | NO EJECUTADA | Requiere mock/sandbox de Factus y timeout |
| T05 | NO EJECUTADA | No existe worker/outbox que probar |
| T06 | NO EJECUTADA | Requiere segundo tenant y datos ficticios |
| T07 | NO EJECUTADA | Requiere matriz de roles y acciones |
| T08 | NO EJECUTADA | Requiere membresía revocada |
| T09 | NO EJECUTADA | Requiere reinicio durante emisión |
| T10 | NO EJECUTADA | Requiere pago mixto/cambio |
| T11 | NO EJECUTADA | No existe flujo de devolución; crédito podría probarse con datos aislados |
| T12 | NO EJECUTADA | No hay backup/restauración operativa |
| T13 | NO EJECUTADA | Requiere rango fiscal mal configurado y sandbox |
| T14 | NO EJECUTADA | No se creó una base nueva/fallida |

## 7. Plan priorizado

### P0 — antes de cualquier producción

1. Corregir aislamiento tenant en emisión, usuarios, tenants, empresa, reportes y descargas; añadir pruebas T06/T07.
2. Envolver `completeSale`/`createSale` en transacciones y añadir idempotencia y bloqueo de estado; corregir ticket único.
3. Corregir crédito (montos positivos, abonos parciales, transacción) e inventario por sede con movimientos.
4. Implementar outbox/worker durable, reconciliación y estados fiscales seguros; eliminar `desconocido => ACCEPTED`.
5. Corregir payload fiscal de cliente NIT, descuentos y forma de pago; validar contra sandbox y documentación vigente.
6. Redactar secretos/passwords y eliminar credenciales semilla; rotar las expuestas.

### P1 — antes de ampliar pilotos

7. Reemplazar etiquetas/XML ficticios por estados y documentos reales; separar REC, factura y equivalente POS.
8. Corregir caja, reportes y conciliación de efectivo/egresos/transferencias.
9. Reparar API keys/API pública o deshabilitarla; aplicar rate limit y tenant desde la key.
10. Corregir Docker/standalone, compose prod y migraciones; probar base vacía y restaurada.
11. Implementar backups cifrados, restauración y retención documental.
12. Implementar healthchecks, logs/alertas y runbook; declarar offline no soportado.

### P2 — mejora posterior

13. Implementar devoluciones/notas crédito con trazabilidad fiscal.
14. Corregir ticket/CSV (IVA real, etiquetas) y pruebas visuales.
15. Actualizar arquitectura/informes, instalar ESLint y añadir CI con T01-T14.

## 8. Criterios de cierre verificables

| Hallazgo | Criterio de cierre |
|---|---|
| F-01 | T06/T07 denegados en servidor; ningún DTO contiene secretos; emisión solo dentro del tenant de la sesión |
| F-02 | T01/T03 pasan; una venta tiene un solo conjunto de pagos/stock/cargos; rollback completo |
| F-03 | Dos creaciones concurrentes no repiten `(tenantId, ticketNumber)` |
| F-04 | T04/T05/T09 sin duplicado; estado desconocido no es `ACCEPTED`; documento local y proveedor reconciliados |
| F-05 | Payload NIT, consumidor final, crédito, split y descuento validado; totales conciliados |
| F-06 | Documento interno nunca se rotula DIAN/ACEPTADO; XML real o vacío |
| F-07 | Sin secretos en respuestas/auditoría; passwords hasheados; cuentas semilla bloqueadas |
| F-08 | T02 consistente; stock por sede; movimientos registrados |
| F-09 | T10 concilia efectivo/cambio/split/crédito; cierre idempotente y autorizado |
| F-10 | API key válida/revocada/expirada probada; tenant desde key; 429; tabla existe |
| F-11 | Venta sin factura queda pendiente y se recupera sin duplicar |
| F-12 | Docker build/arranque OK; esquema desde cero coincide; migración recuperable |
| F-13 | T12 restaura datos, accesos y documentos en entorno aislado |
| F-14 | Healthcheck real y alertas; runbook probado |
| F-15 | T11 sin exceso/duplicado; nota crédito vinculada |
| F-16 | Ticket/CSV con IVA real y etiquetas correctas |
| F-17 | T01-T14 automatizadas o documentadas; CI verde; documentación actualizada |

## 9. Recomendación de salida

**NO APTO para producción.**

Motivos: los defectos de aislamiento multi-tenant, atomicidad del cobro, integridad fiscal y exposición de secretos son bloqueantes. No se declara cumplimiento DIAN ni seguridad integral. La recomendación es corregir P0, ejecutar T01-T14 en un entorno aislado con sandbox y repetir esta auditoría antes de habilitar emisión fiscal real.

## Anexo A. Evidencia de base de datos

- PostgreSQL 18.1 local, base `pruebas_POS`.
- 35 tablas; 1 tenant; 2 usuarios; 2 cuentas; 2 membresías.
- 30 ventas; 127 ítems; 27 pagos; 21 documentos fiscales; 8 facturas legacy.
- 100 productos; 300 filas de inventario; 3 locations; 11 clientes; 10 proveedores.
- 0 registros en `outbox_event`, `idempotency_record`, `fiscal_submission_attempt`, `fiscal_document_status_history`, `cash_movement`, `inventory_movement` y `product_category`.
- 52 registros de auditoría; 1 contiene `password`.
- `api_key` no existe en la base, aunque el schema la define.
- `paymentSnapshot` difiere del total en 19 de 21 documentos fiscales.
- Factus configurado en sandbox/demo; no se emitieron documentos durante la auditoría.

## Anexo B. Archivos revisados

- `CHECKLIST_AUDITORIA_POS.md`, `ARQUITECTURA_POS_DIAN_COLOMBIA.md`, `INFORME_SEGURIDAD.md`, `PLAN_REFACTORIZACION.md`, `INFORME_RESOLUCIONES_DIAN.md`.
- `app/actions/*.ts`, `app/api/**`, `proxy.ts`, `lib/auth*`, `lib/security/*`, `lib/api/*`, `lib/db/**`, `lib/invoicing/**`, `lib/fiscal/*`, `lib/reports/*`, `components/invoices/*`, `components/settings/*`, `app/dashboard/invoices/page.tsx`, `app/dashboard/dian/page.tsx`.
- `drizzle/*`, `Dockerfile`, `docker-compose*.yml`, `next.config.mjs`, `package.json`, `.env.example`, `packages/*/src/*`.
- `test/**`, `scripts/seed.ts`, `lib/utils/*`.

No se incluyen valores de secretos, cadenas de conexión, tokens ni PII.
