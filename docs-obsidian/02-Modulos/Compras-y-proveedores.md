---
tags:
  - modulo/compras
  - modulo/proveedores
estado: documentada
ruta-codigo:
  - app/dashboard/inventory/
  - app/actions/purchase-orders.ts
  - app/actions/suppliers.ts
  - lib/db/schema/purchasing.ts
  - lib/db/schema/catalog.ts
---

# Compras y proveedores

## Lo que registra el código

`supplier` contiene nombre, NIT y contacto. `purchase_order` contiene empresa, proveedor, número, usuario, estado, totales, fechas de entrega/recibo y notas. La acción crea la orden como `COMPLETED`; al seleccionar un producto puede actualizar precio/costo/margen y sumar cantidad a un registro de inventario.

## Límite importante

El esquema leído solo declara `supplier` y `purchase_order`: no existe `purchase_order_item` en el índice de esquemas actual. La acción captura detalles del producto/cantidad/precios en texto de `notes`, no en líneas relacionales. La recepción y el ajuste de inventario no están implementados como un libro de líneas completo en esta acción.

> [!question] Por verificar
> Revisar atomicidad entre ajuste de catálogo/stock y creación de la orden, selección de sede y trazabilidad de kardex. No asumir que una compra registrada implica un proceso formal de recepción por ítems.

## Código

UI y acceso se encuentran principalmente en el área de inventario; acciones: `app/actions/purchase-orders.ts` y `app/actions/suppliers.ts`. Ver [[02-Modulos/Catalogo-e-inventario]].
