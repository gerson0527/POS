---
tags:
  - arquitectura
  - repositorio
estado: documentada
ruta-codigo:
  - app/
  - components/
  - lib/
  - drizzle/
  - test/
  - scripts/
  - src-tauri/
---

# Estructura del repositorio

| Ruta | Contenido observado |
|---|---|
| `app/` | App Router, páginas públicas, dashboard, Server Actions y endpoints API |
| `app/dashboard/` | POS, caja/cierre, inventario, clientes, facturas, DIAN, devoluciones, reportes, usuarios, ajustes y onboarding |
| `app/actions/` | Operaciones de negocio por dominio y helpers compartidos |
| `app/api/` | Auth, backup, canales, cron, health, reportes, setup y API v1 |
| `components/` | Componentes UI organizados por dominio |
| `lib/` | Servicios, lógica fiscal, auth, persistencia, canales, reportes, utils |
| `lib/db/schema/` | Declaraciones Drizzle por dominio |
| `drizzle/` | Migraciones SQL y journal |
| `test/` | Pruebas agrupadas por acciones, auth, backup, dominios e integración |
| `scripts/` | Migraciones, seed, diagnósticos, Telegram y preparación de bundles |
| `src-tauri/` | Runtime Tauri, backend y bundle PostgreSQL para escritorio |
| `postman-dian/` | Colecciones de pruebas de API |
| `public/` | Recursos estáticos |

## Guía de navegación por dominio

- Operaciones: [[02-Modulos/POS-ventas-y-pagos]], [[02-Modulos/Caja-y-cierres]].
- Catálogo: [[02-Modulos/Catalogo-e-inventario]], [[02-Modulos/Compras-y-proveedores]].
- Administración: [[02-Modulos/Autenticacion-y-tenancy]], [[02-Modulos/Usuarios-y-configuracion]].
- Fiscal: [[02-Modulos/Facturacion-Factus-y-DIAN]], [[02-Modulos/Cola-fiscal-y-reintentos]].
- Datos/API: [[03-Datos/Modelo-de-datos]], [[04-Interfaces/API-y-rutas]].
