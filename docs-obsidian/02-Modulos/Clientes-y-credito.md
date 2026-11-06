---
tags:
  - modulo/clientes
  - modulo/credito
estado: documentada
ruta-codigo:
  - app/dashboard/customers/
  - app/actions/customers.ts
  - lib/credit/terms.ts
  - lib/db/schema/customers.ts
  - lib/sales/service.ts
---

# Clientes y crédito

## Clientes

La ficha tiene identificación, tipo/personería, nombres, información de contacto, ubicación y códigos fiscales; también puede activar crédito, fijar cupo, saldo y estado. CRUD desde `/dashboard/customers`; las acciones asocian el actor con su tenant y registran auditoría. La eliminación se bloquea cuando la ficha tiene ventas registradas.

## Crédito interno

`customer_credit_transaction` registra cargos (`CHARGE`) y abonos (`PAYMENT`), monto, pagado, saldo posterior, venta opcional, vencimiento y estado. Una venta con pago `STORE_CREDIT` exige cliente con crédito habilitado, no bloqueado y dentro del cupo; añade cargo y actualiza el saldo dentro de la transacción de completar venta.

Los abonos se aplican contra los cargos pendientes/vencidos en orden de creación. El día de pago por empresa se normaliza entre 1 y 30 y vence en el mes siguiente; valor por defecto en código: 15.

## Relación con otros módulos

- Los datos del cliente en una venta se guardan como snapshot plano.
- El reembolso `CREDIT_BALANCE` de una devolución requiere cliente identificado y saldo pendiente.
- Ver [[02-Modulos/POS-ventas-y-pagos]], [[02-Modulos/Devoluciones]] y [[03-Datos/Modelo-de-datos]].
