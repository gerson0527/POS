# Revisión técnica del POS: integridad, seguridad y operación

## Instrucciones para el auditor o asistente de código

Actúa como auditor senior de aplicaciones Next.js, PostgreSQL, sistemas POS multiempresa e integración con Factus.

Revisa el repositorio real y determina si los controles siguientes están correctamente implementados. Esta tarea es de diagnóstico: no modifiques código, migraciones, configuración ni infraestructura sin autorización posterior. No emitas documentos fiscales, no cobres pagos ni ejecutes pruebas destructivas en producción. Utiliza un entorno aislado y datos de prueba.

El contexto de referencia es ARQUITECTURA_POS_DIAN_COLOMBIA.md: Next.js 16, React 19, TypeScript, Drizzle, PostgreSQL, Better Auth, Server Actions, base master y una base por tenant; Factus como proveedor fiscal y Tauri opcional. Confirma versiones y diseño contra el código. Si difieren, documenta la discrepancia y usa la implementación como evidencia. No presupongas NestJS, Prisma, Redis, BullMQ, RLS ni microservicios.

## Reglas de evidencia

- No marques un punto como correcto porque aparece en el README, existe una función o pasa el build.
- Clasifica cada control: CUMPLE, PARCIAL, NO CUMPLE, NO VERIFICABLE o NO APLICA.
- CUMPLE requiere evidencia adecuada al control; para garantías de ejecución, incluye pruebas reproducibles. Si solo hay inspección estática, declara esa limitación.
- Diferencia defecto confirmado, riesgo potencial y mejora opcional.
- Cita archivo, símbolo y líneas cuando sea posible; incluye comandos ejecutados y resultados reales.
- Si no puedes ejecutar una prueba, explica el bloqueo y el procedimiento pendiente. Nunca inventes resultados.
- No muestres secretos, cadenas de conexión completas, tokens ni datos personales. Redacta los valores sensibles.
- No atribuyas cumplimiento DIAN integral a un build o una respuesta HTTP exitosa. Verifica documentación oficial vigente y evidencia del ambiente correspondiente.
- No asignes porcentajes globales de preparación sin una metodología explícita.

## 1. Inventario inicial y reproducibilidad

- [ ] Confirmar dependencias, runtime, lockfile, scripts y estructura real.
- [ ] Identificar rutas privadas, Server Actions, APIs, acceso a datos y conexión fiscal.
- [ ] Revisar variables obligatorias y validación al inicio, sin exponer valores.
- [ ] Separar desarrollo, pruebas y producción: bases, credenciales, URLs y rangos fiscales.
- [ ] Ejecutar instalación reproducible, typecheck, tests y build mediante los scripts reales disponibles.
- [ ] Registrar comandos, versión del runtime, resultados y bloqueos externos.

## 2. Atomicidad de venta, pagos, inventario y caja

Inspeccionar completeSale y todos los caminos que finalicen una venta.

- [ ] Recalcular precios, descuentos, impuestos y totales en servidor con fuentes autorizadas; no confiar en importes enviados por el cliente.
- [ ] Validar caja abierta, pertenencia a empresa, permisos y reglas de crédito.
- [ ] Confirmar que las escrituras relacionadas usan una misma transacción y la misma conexión transaccional.
- [ ] Incluir venta, ítems, pagos, movimientos de inventario y caja que correspondan al modelo contable.
- [ ] Revertir todo ante un fallo intermedio.
- [ ] Validar cantidades positivas, precisión monetaria y política explícita de stock negativo.
- [ ] Evitar sobreventa concurrente mediante actualizaciones condicionales, bloqueos u otra estrategia demostrable.
- [ ] Garantizar unicidad de consecutivos locales bajo concurrencia.
- [ ] Evitar llamadas HTTP al proveedor fiscal dentro de una transacción larga de inventario.

Pruebas mínimas: fallo inyectado tras registrar un pago; dos ventas concurrentes de la última unidad; dos reservas concurrentes de consecutivo; venta con precio manipulado. Comprobar estado final en BD, no solo respuesta del endpoint.

## 3. Idempotencia del cobro y cierre de venta

- [ ] Tener una clave estable por operación lógica, conservada al reintentar.
- [ ] Aplicar unicidad en BD en el ámbito adecuado, no solo deshabilitar el botón del frontend.
- [ ] Una repetición válida devuelve el resultado original sin duplicar efectos.
- [ ] Una misma clave con contenido incompatible se rechaza o se trata mediante una política explícita.
- [ ] Proteger solicitudes simultáneas, recargas y respuestas perdidas.

Prueba: enviar en paralelo la misma operación y verificar una única venta y un único conjunto de efectos financieros y de inventario.

## 4. Integración fiscal e idempotencia ante fallos

Inspeccionar emitSaleElectronicInvoice, el adaptador Factus, el almacenamiento fiscal y la documentación oficial actual del proveedor.

- [ ] Verificar endpoints y semántica reales: no asumir que la secuencia descrita en el documento es correcta para la versión utilizada.
- [ ] Utilizar una referencia estable por documento lógico y cuenta emisora, compatible con reference_code y sus restricciones vigentes.
- [ ] Cubrir el caso proveedor procesa / aplicación pierde respuesta / CUFE todavía no persistido.
- [ ] Reconciliar antes de generar un nuevo documento o referencia tras un timeout ambiguo.
- [ ] Proteger concurrencia con restricciones únicas y una estrategia de coordinación verificable.
- [ ] Validar estados de negocio del proveedor; HTTP 200 por sí solo no demuestra validación fiscal.
- [ ] Separar estados internos de procesamiento de estados fiscales.
- [ ] Guardar identificadores, CUFE cuando corresponda, estado, fechas y trazabilidad sin secretos.
- [ ] Conservar el contenido emitido o una instantánea inmutable para que un reintento no facture datos posteriormente modificados.
- [ ] Manejar expiración del token, timeout, 429, 5xx y errores de validación conforme a la documentación.
- [ ] No reintentar automáticamente errores permanentes sin corrección.

Pruebas: timeout posterior al procesamiento; dos emisiones simultáneas de la misma venta; fallo al persistir la respuesta; token expirado; rechazo fiscal. Usar mocks y sandbox, nunca producción sin autorización específica.

## 5. Trabajos persistentes y recuperación

- [ ] Confirmar si existe una bandeja persistente u otro mecanismo equivalente; no exigir una tecnología concreta.
- [ ] Registrar la intención fiscal de forma atómica con la venta cuando el flujo la requiera.
- [ ] Tener worker o ejecutor durable, no una promesa lanzada sin garantía tras responder HTTP.
- [ ] Reclamar trabajos concurrentemente sin procesamiento descontrolado.
- [ ] Implementar lease/bloqueo temporal y recuperación de trabajos abandonados.
- [ ] Definir reintentos limitados, espera progresiva y tratamiento de fallos permanentes.
- [ ] Garantizar efectos idempotentes: un worker puede procesar de nuevo un trabajo después de fallar.
- [ ] Alertar por trabajos atascados y permitir reintento autorizado y auditado.

Prueba: detener el proceso después de enviar y antes de confirmar; reiniciar y demostrar recuperación sin duplicado fiscal.

## 6. Ticket interno, factura electrónica y documento equivalente

- [ ] Identificar qué documentos fiscales soporta realmente el producto.
- [ ] Diferenciar ticket interno REC, factura electrónica y documento equivalente electrónico POS.
- [ ] No presentar un recibo local como documento validado por DIAN.
- [ ] Separar numeración interna de rangos fiscales del proveedor.
- [ ] Revisar que la pantalla llamada RESOLUCIONES DIAN no administre únicamente tickets internos bajo un título engañoso.
- [ ] Verificar ambiente, emisor, vigencia y rango aplicables con fuentes oficiales y del proveedor.
- [ ] Tratar el fallback de numeración interna solo como regla comercial; nunca como autorización fiscal.
- [ ] Distinguir fecha de venta, emisión y validación; comprobar zona horaria y persistencia.
- [ ] Documentar el alcance fiscal y las limitaciones sin prometer funciones no verificadas.

## 7. Autenticación, permisos y aislamiento por tenant

- [ ] Validar sesión y autorización dentro de cada Server Action y endpoint privado, no solo en proxy o UI.
- [ ] Derivar el tenant autorizado a partir de membresías comprobadas en servidor.
- [ ] Tratar X-Tenant-ID, slugs e IDs del cliente como datos no confiables.
- [ ] Verificar permisos y propiedad de objetos en lectura, escritura, exportaciones, reportes y descargas.
- [ ] Revisar el fallback default hacia master y demostrar que no permite resolver una BD equivocada.
- [ ] Evitar contaminación de cachés, pools, reportes y archivos entre empresas.
- [ ] Validar y componer de forma segura identificadores usados para crear o seleccionar bases.
- [ ] Revisar revocación de sesiones y efecto de cambios de rol o membresía.
- [ ] Probar ADMIN, MANAGER, CASHIER y VIEWER con una matriz de acciones permitidas y denegadas.

Pruebas: usuario A accede a IDs de B; cambia header y slug; invoca directamente una acción restringida; consulta XML o PDF de B; usa membresía revocada. No basta con ocultar botones.

## 8. Secretos, errores y privilegios

- [ ] Revisar cifrado real de credenciales, autenticidad/integridad del cifrado, manejo de errores y migración de datos antiguos.
- [ ] Mantener la clave fuera de BD y repositorio, con recuperación y rotación documentadas.
- [ ] No devolver secretos a componentes cliente, serializaciones, respuestas o logs.
- [ ] Separar error público seguro y diagnóstico interno mediante identificador de correlación.
- [ ] Eliminar o bloquear credenciales de semilla conocidas en producción, sin reproducir sus valores.
- [ ] Separar rol de ejecución y rol de aprovisionamiento/migración; aplicar mínimo privilegio.
- [ ] Revisar TLS, cookies, protección de origen/CSRF aplicable, límites de solicitudes y recuperación de cuenta.
- [ ] Revisar acceso a reportes, XML, PDF y claves API según su implementación real.

## 9. Exactitud monetaria, pagos y caja

- [ ] Confirmar que numeric no se convierte a number con pérdida de precisión en cálculos relevantes.
- [ ] Definir precisión, redondeo y orden de cálculo para precios, descuentos, bases e impuestos.
- [ ] Investigar la tolerancia documentada de 100 COP: justificación y aplicación real.
- [ ] No aceptar diferencias silenciosas; registrar ajustes autorizados explícitamente.
- [ ] Separar efectivo entregado, efectivo aplicado y cambio.
- [ ] Conciliar pagos divididos con el total pagadero según una política documentada.
- [ ] Verificar impuestos, exentos/excluidos, descuentos y totales contra el payload fiscal.
- [ ] Conciliar cierre de caja, ingresos, egresos, devoluciones y ventas a crédito.
- [ ] Distinguir referencia ingresada de confirmación real de pago cuando exista una integración externa.

Pruebas: efectivo con cambio; split; descuentos; diferencias de redondeo; referencia duplicada según la regla comercial; devolución parcial; abono a crédito.

## 10. Devoluciones, notas crédito y crédito interno

- [ ] Confirmar si existen devoluciones totales/parciales y su autorización.
- [ ] Evitar devolver más cantidad o dinero que lo vendido y no devuelto.
- [ ] Restaurar stock solo cuando la política del producto lo determine.
- [ ] Registrar salida de dinero, ajuste de deuda y trazabilidad coherentes.
- [ ] Vincular nota crédito al documento correspondiente según el flujo fiscal aplicable.
- [ ] No borrar ventas ni documentos emitidos para simular una anulación.
- [ ] Aplicar idempotencia a devoluciones y abonos.
- [ ] Proteger cupos y saldos de crédito ante concurrencia.

## 11. Bases por empresa y migraciones

- [ ] Limitar pools, conexiones máximas e inactividad por tenant.
- [ ] Calcular presupuesto total de conexiones para el número esperado de procesos y empresas activas.
- [ ] Evitar fugas de conexiones y eliminación de pools todavía en uso.
- [ ] Registrar versión de esquema y resultado de migración por tenant.
- [ ] Manejar aprovisionamiento parcial, reintentos y limpieza segura.
- [ ] Ejecutar migraciones de forma controlada, sin carreras entre réplicas ni cambios destructivos implícitos.
- [ ] Contemplar compatibilidad durante despliegues y recuperación tras migración fallida.
- [ ] No utilizar db:push indiscriminadamente como sustituto de migraciones de producción.

## 12. Backups y conservación documental

- [ ] Incluir master, bases de tenants, documentos y dependencias necesarias para recuperar acceso.
- [ ] Definir objetivos de pérdida máxima de datos (RPO) y tiempo de recuperación (RTO).
- [ ] Cifrar respaldos, restringir acceso y conservar copia independiente del servidor principal.
- [ ] Alertar por fallos y verificar integridad.
- [ ] Hacer restauración real en entorno aislado y comprobar coherencia de membresías y negocio.
- [ ] Documentar recuperación segura de claves; respaldar solo la BD cifrada no basta si se pierde la clave.
- [ ] Verificar conservación y recuperación de XML/PDF; no depender sin evaluación de enlaces temporales del proveedor.
- [ ] Definir retención conforme a obligaciones aplicables, comprobadas con fuentes vigentes.

## 13. Monitoreo, despliegue y operación offline

- [ ] Logs estructurados con correlación por operación y tenant, sin datos sensibles innecesarios.
- [ ] Alertas por errores fiscales, pendientes antiguos, saturación de conexiones y backups fallidos.
- [ ] Healthchecks que no expongan configuración ni detalles privados.
- [ ] Procedimiento de despliegue, migración, verificación y reversión o recuperación.
- [ ] Documentar comportamiento ante pérdida de internet.
- [ ] No confundir Tauri/SQLite con sincronización multi-dispositivo ni contingencia fiscal implementada.
- [ ] Si hay modo offline, probar conflictos, identidades, consecutivos y reenvíos con política explícita.
- [ ] Probar impresoras y otros periféricos realmente soportados, sin asumir agente ESC/POS existente.

## 14. Matriz de pruebas de aceptación

| ID | Escenario | Resultado esperado |
|---|---|---|
| T01 | Doble solicitud de cobro | Una venta y un conjunto de efectos |
| T02 | Dos cajas venden la última unidad | Stock consistente según política explícita |
| T03 | Fallo tras pago, antes de finalizar | Rollback completo |
| T04 | Factus procesa y la respuesta se pierde | Reconciliación sin nuevo documento lógico |
| T05 | Dos workers toman un pendiente | Coordinación y efectos idempotentes |
| T06 | Acceso de A a datos o archivos de B | Denegado sin filtración |
| T07 | Cajero invoca operación administrativa | Denegado en servidor |
| T08 | Se revoca la membresía | Acceso revocado según política verificada |
| T09 | Reinicio durante emisión | Recuperación trazable |
| T10 | Pago mixto y efectivo con cambio | Conciliación monetaria correcta |
| T11 | Devolución parcial repetida | Sin exceso ni doble devolución |
| T12 | Restauración de empresa | Datos, acceso y documentos recuperables |
| T13 | Rangos fiscales mal configurados | Error seguro; no simular emisión con REC |
| T14 | Nueva base falla al migrar | Estado recuperable y sin empresa falsamente lista |

Para cada prueba registra preparación, datos ficticios, pasos o comando, resultado observado, aserciones sobre BD, limpieza y evidencia. Las pruebas de concurrencia deben ser realmente paralelas.

## 15. Entregables obligatorios

1. Resumen ejecutivo con bloqueantes confirmados, riesgos y límites de la revisión.
2. Inventario del diseño real y discrepancias frente al documento.
3. Matriz de controles: ID, estado, severidad, evidencia y prueba asociada.
4. Hallazgos detallados: causa, impacto, reproducción segura y corrección mínima propuesta.
5. Comandos ejecutados y resultados reales; identificar claramente los no ejecutados.
6. Plan priorizado: P0 antes de producción; P1 antes de ampliar pilotos; P2 mejora posterior.
7. Criterio de cierre verificable para cada hallazgo.
8. Recomendación de salida: no apto, piloto condicionado o apto dentro del alcance revisado. No declarar cumplimiento integral ni garantía absoluta.

### Plantilla de hallazgo

- ID / título:
- Tipo: defecto confirmado / riesgo potencial / mejora opcional.
- Estado y severidad, con justificación:
- Archivo, símbolo y líneas:
- Evidencia observada:
- Escenario de fallo o abuso:
- Prueba ejecutada y resultado:
- Limitaciones de verificación:
- Corrección mínima recomendada:
- Criterio de aceptación:

## Orden de ejecución

Primero inventario y evidencia estática; después pruebas aisladas de integridad, permisos e idempotencia; luego fiscal, recuperación y operación. No avances a pruebas con efectos externos sin autorización específica. Finaliza con un informe de diagnóstico, no con cambios automáticos.

## Base documental

Esta lista deriva de los puntos discutidos y del documento ARQUITECTURA_POS_DIAN_COLOMBIA.md aportado por el propietario. Ese documento es contexto, no evidencia de implementación. Para conclusiones sobre Next.js, Factus y DIAN consulta documentación oficial vigente y registra URL, fecha y alcance en el informe.
