---
tags:
  - modulo/catalogo
  - modulo/inventario
estado: documentada
ruta-codigo:
  - app/dashboard/inventory/
  - app/dashboard/categories/
  - app/actions/products.ts
  - app/actions/categories.ts
  - app/actions/inventory.ts
  - lib/inventory/service.ts
  - lib/db/schema/catalog.ts
---

# Catálogo e inventario

## Modelo

`product` guarda SKU, código de barras, nombre, categoría, precio/costo, tasa IVA y tratamiento tributario (`TAXED`, `EXEMPT`, `EXCLUDED`). `inventory` mantiene cantidades por sede y producto. `inventory_movement` registra entradas, salidas, ajustes y movimientos de ventas/devoluciones. `product_category` es el catálogo de categorías.

## Movimientos

El servicio `recordInventoryMovement()` acepta entrada, salida o ajuste con delta firmado; requiere ADMIN/MANAGER, valida empresa/producto/sede, bloquea el saldo y rechaza quedar bajo cero. Un `idempotencyKey` evita aplicar dos veces el mismo movimiento. Ajustes requieren motivo o nota y generan auditoría.

La venta completa descuenta stock en su transacción; las devoluciones registran una entrada. Ver [[02-Modulos/POS-ventas-y-pagos]] y [[02-Modulos/Devoluciones]].

## UI y límites

Las acciones recuperan estadísticas, movimientos y productos; la UI está bajo `/dashboard/inventory` y `/dashboard/categories`. El conteo bajo de la acción de estadísticas compara cantidad con 10; ese umbral pertenece a esa consulta, no necesariamente a una regla universal de stock mínimo.

> [!question] Por verificar
> Confirmar si el usuario debe configurar `reorderPoint` por producto/sede y qué alertas usan ese valor; no inferirlo del umbral usado por `getInventoryStats()`.
