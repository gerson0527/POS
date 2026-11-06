---
tags:
  - modulo/caja
  - modulo/operaciones
estado: documentada
ruta-codigo:
  - app/dashboard/cashier/
  - app/dashboard/cash-closure/
  - app/actions/cashier.ts
  - app/actions/z-report.ts
  - lib/cash/reconcile.ts
  - lib/db/schema/sales.ts
---

# Caja y cierres

## Sesiones de caja

`cashier_session` registra empresa, sede, usuario, fecha de negocio, saldo inicial, estado y saldos de cierre. Abrir caja valida rol, saldo inicial y pertenencia del cajero al tenant cuando se asigna a otra persona. El esquema impide más de una sesión ordinaria abierta por cajero/tenant mediante índice único parcial; existen turnos de override autorizados.

Las ventas requieren turno abierto del día. Movimientos manuales usan tipos `INGRESO`, `EGRESO`, `RETIRO` y `DEVOLUCION`; se registran con auditoría y se reflejan en rutas de caja/cierre.

## Reporte Z

`buildSessionZReportData()` toma ventas completadas y pagos procesados/aprobados; agrupa efectivo, tarjetas, transferencias, crédito y otros medios. Suma movimientos de caja para determinar movimientos netos y efectivo esperado, además de mostrar diferencias.

Las horas de comprobantes se formatean en `America/Bogota` desde el servidor. El cierre Z no es la factura electrónica: es el arqueo de un turno.

## Rutas y código

- UI: `/dashboard/cashier` y `/dashboard/cash-closure`.
- Acciones: `app/actions/cashier.ts`, `app/actions/z-report.ts`.
- Modelo: `cashier_session`, `cash_movement`, más ventas y pagos en `lib/db/schema/sales.ts`.
- Las devoluciones en efectivo pueden añadir movimiento `DEVOLUCION`: [[02-Modulos/Devoluciones]].
