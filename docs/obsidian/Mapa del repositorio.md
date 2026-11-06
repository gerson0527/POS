---
tipo: referencia
tags:
  - proyecto/mapa
  - arquitectura
---

# Mapa del repositorio

La descripción de capas y límites está en [[ARQUITECTURA_POS_DIAN_COLOMBIA]]. Esta nota sirve para orientarse en el código sin duplicarlo.

## Flujo general

```text
app/dashboard y components
        ↓
app/actions (sesión, roles y tenant)
        ↓
lib (servicios de dominio)
        ↓
lib/db/schema (Drizzle) → PostgreSQL
        ↓
Factus (solo para emisión electrónica)
```

La app es un monolito Next.js con App Router. El UI usa Server Actions para operaciones; hay endpoints API para integraciones y tareas específicas. `proxy.ts` participa en la protección de rutas.

## Dominios

| Dominio | Ubicación principal | Referencias |
|---|---|---|
| Punto de venta y ventas | `app/dashboard/pos/`, `app/actions/sales.ts`, `lib/sales/`, `lib/pos/` | Carrito, pagos, ventas y comprobante local |
| Caja y cierres | `app/dashboard/cashier/`, `app/dashboard/cash-closure/`, `lib/cash/` | Turnos, movimientos y cierre |
| Catálogo e inventario | `app/dashboard/inventory/`, `app/dashboard/categories/`, `lib/inventory/` | Productos, stock y movimientos |
| Clientes y crédito | `app/dashboard/customers/`, `lib/credit/` | Clientes, cartera y transacciones |
| Devoluciones | `app/dashboard/returns/`, `app/actions/returns.ts`, `lib/returns/` | Devoluciones y efectos en inventario/caja/cartera |
| Facturación | `app/dashboard/invoices/`, `lib/invoicing/` | Payload Factus, documentos y consultas |
| Cola fiscal | `lib/fiscal/outbox.ts`, `lib/db/schema/outbox.ts`, `app/api/cron/fiscal-outbox/` | Reintentos y reconciliación de emisión |
| Backup | `app/api/backup/`, `lib/backup/`, `components/settings/BackupSection.tsx` | Exportación SQL por tenant |
| Asistente y canales | `lib/assistant/`, `lib/channels/`, `app/api/channels/`, `app/actions/assistant.ts` | Canales, mensajes y borradores |
| Autenticación y tenancy | `lib/auth/`, `lib/db/tenant-connection.ts`, `lib/db/tenant-provisioner.ts` | Sesión, roles y bases por empresa |
| Escritorio | `src-tauri/`, `scripts/prepare-tauri-dist.js`, `scripts/prepare-postgres-dist.js` | Ventana Tauri, backend web empaquetado y PostgreSQL privado |

## Persistencia y pruebas

- Registro de esquemas: `lib/db/schema/index.ts`.
- Migraciones: `drizzle/*.sql` y `drizzle/meta/_journal.json`.
- Pruebas: `test/`, organizadas por dominio; Vitest se configura en `vitest.config.ts`.
- Contratos HTTP externos: `postman-dian/`.

## Notas de mantenimiento

- Una migración de esquema debe seguir la práctica existente de Drizzle y quedar versionada en `drizzle/`.
- No inferir el comportamiento activo de escritorio solo a partir de comentarios heredados: el arranque está en `src-tauri/src/main.rs` y el proceso PostgreSQL en `src-tauri/src/postgres.rs`.
- El archivo [[DIAGNOSTICO_FACTURACION_FACTUS]] es histórico y no sustituye la verificación del código actual.
