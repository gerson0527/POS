---
tags:
  - modulo/fiscal
  - modulo/cola
estado: documentada
ruta-codigo:
  - lib/fiscal/outbox.ts
  - lib/db/schema/outbox.ts
  - app/api/cron/fiscal-outbox/route.ts
  - app/actions/sales.ts
  - app/actions/factus-service.ts
  - vercel.json
---

# Cola fiscal y reintentos

## Ciclo

Cuando se completa una venta con proveedor Factus configurado, `enqueueFiscalEmission()` inserta `fiscal_outbox` en la misma transacción de negocio. En modo `AUTO`, después del commit se intenta reclamar/procesar el evento; en `MANUAL` queda retenido. Si no hay proveedor, no se crea evento fiscal.

El worker usa `FOR UPDATE SKIP LOCKED` para reclamar lotes. Mantiene estados `PENDING`, `PROCESSING`, `DONE`, `FAILED`, intentos, bloqueo, próximo intento, último error y flags de aprobación manual/reconciliación. El límite por evento se declara en esquema como 10 intentos; el backoff crece y se limita a 60 minutos. Bloqueos `PROCESSING` antiguos pueden recuperarse.

Si una respuesta externa fue incierta, el próximo intento pide a Factus buscar la factura por referencia antes de reenviar. Para terminar como éxito normal, el worker requiere CUFE persistido.

## Disparadores

- Procesamiento tras completar una venta automática.
- Endpoint `GET`/`POST /api/cron/fiscal-outbox`, validado con `CRON_SECRET`.
- `vercel.json` programa ese endpoint una vez al día con expresión `0 6 * * *`.
- Emisión manual individual desde el módulo de facturas utiliza el claim del outbox.

> [!question] Por verificar
> Confirmar zona horaria efectiva del cron en la cuenta/proveedor de despliegue y que `CRON_SECRET` esté configurado allí. La expresión del repositorio no prueba que el cron esté activo en un entorno concreto.

Ver [[02-Modulos/Facturacion-Factus-y-DIAN]] y [[05-Operacion/Cron-y-tareas-programadas]].
