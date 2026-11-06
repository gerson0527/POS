---
tags:
  - modulo/pos
  - modulo/ventas
estado: documentada
ruta-codigo:
  - app/dashboard/pos/
  - app/dashboard/pos-terminal/
  - app/actions/sales.ts
  - app/actions/pos-actions.ts
  - lib/sales/service.ts
  - lib/hooks/use-cart.ts
  - lib/utils/pos-utils.ts
  - lib/utils/payment-splits.ts
  - components/pos/PaymentModal.tsx
  - lib/db/schema/sales.ts
---

# POS, ventas y pagos

## Flujo observado

1. El POS arma un carrito y presenta productos/stock desde la UI.
2. `createSale()` en `lib/sales/service.ts` requiere rol operativo y turno de caja abierto del día de negocio en Bogotá. Crea venta `DRAFT`, líneas y precios/impuestos desde el producto.
3. La disponibilidad se valida en servidor por sede. El flujo permite venta sin stock únicamente si se solicitó explícitamente.
4. `completeSale()` bloquea la venta y el turno, verifica estado, calcula descuentos/totales, valida que pagos redondeados cuadren con el total, registra los pagos, aplica crédito si corresponde y descuenta inventario con movimiento `SALE`.
5. Se escribe auditoría/evento. Si hay proveedor electrónico, se encola la emisión; en `AUTO` se intenta procesar después del commit y en `MANUAL` queda para transmisión explícita.

La división de pagos se presenta en `PaymentModal`; las reglas puras viven en `lib/utils/payment-splits.ts`. En `build-bill.ts`, los detalles se reconcilian para cuadrar con el total fiscal.

## Reglas y registros

- Estados de venta declarados: `DRAFT`, `CONFIRMED`, `COMPLETED`, `CANCELLED`.
- El ticket interno usa `ticketNumber`; no equivale por sí mismo a una factura electrónica.
- Las líneas guardan cantidad, precio, IVA y tratamiento fiscal aplicado al momento de venta.
- El esquema de `sale` guarda un snapshot plano de datos básicos del cliente.
- Ver [[02-Modulos/Caja-y-cierres]], [[02-Modulos/Clientes-y-credito]] y [[02-Modulos/Facturacion-Factus-y-DIAN]].

> [!question] Por verificar
> La interfaz declara más de un flujo POS (`pos` y `pos-terminal`). Revisar su diferencia funcional y cuál es el flujo recomendado para operación antes de fijar instrucciones de usuario final.
