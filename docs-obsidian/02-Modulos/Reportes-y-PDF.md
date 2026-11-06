---
tags:
  - modulo/reportes
  - modulo/pdf
estado: documentada
ruta-codigo:
  - app/dashboard/reports/
  - app/actions/reports.ts
  - app/api/reports/inventory-pdf/route.ts
  - lib/reports/render.ts
  - lib/reports/pdf-generator.ts
---

# Reportes y PDF

## Reporte de ventas

`getSalesReports()` consulta ventas completadas del tenant y rango opcional de fechas; agrega ingresos, subtotal, impuestos, conteo, promedio, coste estimado y productos. Lee además documentos fiscales para conteo. Para productos sin costo usa en este cálculo un fallback del 70% del precio.

> [!question] Por verificar
> Confirmar con negocio si ese fallback de coste es intencional y debe interpretarse como estimación; no tomar el margen calculado como contabilidad definitiva sin validarlo.

## PDF de inventario

`GET`/`POST /api/reports/inventory-pdf` requiere sesión, resuelve el tenant, permite filtro de sede y obtiene los datos de inventario en servidor. El generador crea HTML y lo renderiza con Puppeteer; `escapeHtml()` centraliza escape y el navegador se reutiliza por proceso. En serverless usa `@sparticuz/chromium`.

El PDF observado es de inventario, con empresa, NIT, sede, productos y totalización. No inferir que todos los reportes de pantalla tienen salida PDF.

## Código y relación

UI: `/dashboard/reports`. Reporte Z de caja: [[02-Modulos/Caja-y-cierres]]. Endpoint y generador: `app/api/reports/inventory-pdf/route.ts`, `lib/reports/pdf-generator.ts`, `lib/reports/render.ts`.
