---
tags:
  - modulo/facturacion
  - integracion/factus
estado: documentada
ruta-codigo:
  - app/actions/factus-config.ts
  - app/actions/factus-service.ts
  - app/dashboard/invoices/
  - lib/invoicing/
  - lib/fiscal/cufe.ts
  - lib/catalogs/dian-status.ts
  - lib/db/schema/fiscal.ts
---

# Facturación electrónica: Factus y DIAN

## Configuración

Las credenciales Factus se leen por tenant desde `tenant` y se cifran al guardar con `lib/security/encrypt.ts`. El código permite credenciales base de entorno y personalización por empresa; `getInvoiceProvider()` combina proveedor base con override de rango/NIT cuando existe. La interfaz expone prueba de conexión y listado de rangos. El cliente no recibe los secretos existentes al cargar la configuración.

## Emisión

`emitSaleElectronicInvoice()` carga venta, cliente, empresa, líneas y pagos; exige estado `COMPLETED`, construye payload y llama `POST /v2/bills/validate`. La clase Factus trata 409 por referencia pendiente, refresca token tras 401, consulta enlaces y permite reconciliar por `reference_code`. Una respuesta sin CUFE no se considera emisión fiscal aceptada.

Al recibir CUFE, el servicio persiste el documento con número fiscal, estado, snapshots de cliente/totales/pagos/ítems, QR y enlaces PDF/XML. El código de referencia se deriva de la venta. La auditoría fiscal incluye resultado y correlación.

## Dos numeraciones distintas

- Ticket/comprobante interno POS: consecutivo de venta o numeración local.
- Rango Factus: numeración electrónica para la factura transmitida.

No presentarlos como el mismo número. El QR apunta a consulta DIAN devuelta por proveedor o al fallback local implementado en `lib/fiscal/cufe.ts`.

## Archivos relacionados

- Construcción de datos: `lib/invoicing/build-bill.ts`.
- HTTP y proveedor: `factus-http.ts`, `factus.ts`, `factus-mappers.ts`.
- Persistencia/orquestación: `emit-invoice.ts`.
- Estados: `lib/catalogs/dian-status.ts`.
- UI: `/dashboard/invoices`; configuración: `/dashboard/settings`.
- Ver [[02-Modulos/Cola-fiscal-y-reintentos]] y [[05-Operacion/Variables-de-entorno]].

> [!question] Por verificar
> La aprobación de la factura depende de Factus/DIAN y de credenciales/rango del tenant. No es posible confirmar desde el código si un rango o certificado está vigente en producción.
