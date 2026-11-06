---
tags:
  - modulo/devoluciones
  - modulo/ventas
estado: documentada
ruta-codigo:
  - app/dashboard/returns/
  - app/actions/returns.ts
  - components/returns/
  - lib/returns/
  - lib/db/schema/returns.ts
  - drizzle/0016_customer_returns.sql
---

# Devoluciones

## Flujo

La búsqueda permite elegir ventas completadas y consultar sus artículos, pagos y devoluciones anteriores. `createCustomerReturn()` bloquea la venta, calcula cantidades/valores ya devueltos y valida que no se exceda lo vendible; asigna consecutivo con prefijo visual `DEV-`.

Roles que pueden crear: ADMIN, MANAGER y CASHIER. ADMIN, MANAGER, CASHIER y VIEWER pueden consultar. Los efectos dependen del reembolso:

- Toda devolución registra entrada de inventario y auditoría/evento.
- Efectivo requiere turno del día y crea movimiento de caja `DEVOLUCION`.
- `CREDIT_BALANCE` abona a cartera de cliente y no puede superar el saldo pendiente.
- Medios como tarjeta/transferencia se almacenan en la devolución; la conciliación externa de ese reembolso no se muestra en este servicio.

## Alcance explícito

El servicio declara que no genera ni transmite factura electrónica ni nota crédito DIAN. La factura original permanece sin modificar. No describir la operación como reversión fiscal automática.

## Datos

`customer_return` guarda venta, empresa, sede, usuario, motivo, importes, método y referencias a movimientos resultantes. `customer_return_item` guarda producto, línea de venta, cantidad, precio e impuestos devueltos.

Ver [[02-Modulos/Caja-y-cierres]], [[02-Modulos/Catalogo-e-inventario]], [[02-Modulos/Clientes-y-credito]] y [[03-Datos/Migraciones]].
