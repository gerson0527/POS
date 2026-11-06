---
tags:
  - deuda-tecnica
  - pendientes
estado: por-verificar
ruta-codigo:
  - package.json
  - lib/db/index.ts
  - lib/db/tenant-connection.ts
  - lib/db/tenant-provisioner.ts
  - lib/db/schema/
  - app/actions/purchase-orders.ts
  - lib/returns/service.ts
  - src-tauri/src/main.rs
  - .env.example
  - lib/assistant/config.ts
  - app/api/setup/route.ts
---

# Deuda técnica y puntos por verificar

Estos son hallazgos de lectura estática; no equivalen a auditoría de seguridad ni validación de producción. Priorizar su confirmación con responsables del sistema.

## Confirmados en el árbol actual

1. **Identidad del paquete:** `package.json` dice `my-project`, mientras `tauri.conf.json` presenta `POS Retail Enterprise DIAN`.
2. **Tenancy no coincide en documentos/código auxiliar:** la app exporta un pool global `db`; las acciones importan ese `db`. `getTenantDb()` aparece solo definido en su módulo. A la vez hay provisioner para bases `pos_tenant_<slug>`. Confirmar aislamiento efectivo y objetivo antes de describirlo como database-per-tenant.
3. **Integridad referencial incompleta en Drizzle:** solo `session.userId` y `account.userId` usan `.references()` en esquemas inspeccionados; gran parte del modelo son IDs enlazados por lógica de aplicación.
4. **Compras resumidas:** no hay modelo de líneas de compra en los esquemas exportados; `purchase-orders.ts` almacena detalles complementarios en notas y modifica inventario/catálogo.
5. **Comandos Tauri demostrativos:** ventas offline/hardware/sync en `main.rs` retornan valores de ejemplo; el backend web y PostgreSQL privados tienen código operativo aparte.
6. **Variables de entorno no centralizadas:** `.env.example` no enumera todo lo que `lib/assistant/config.ts` y runtime/setup leen. Mantener una lista explícita y segura.
7. **Devolución no es nota crédito DIAN:** el servicio interno ajusta inventario/caja/cartera; declara que no modifica factura ni transmite nota crédito.
8. **Backup sin restore en API inspeccionada:** se encontró una ruta de exportación SQL, no una ruta de restauración.

## Requiere revisión de negocio/operación

- > [!question] Confirmar si el costo fallback del 70% del precio en reportes de rentabilidad es intencional.
- > [!question] Confirmar destino/sede, atomicidad y registro kardex en compras al aumentar stock.
- > [!question] Confirmar protección/perímetro del endpoint de setup antes de exponerlo fuera de instalación local.
- > [!question] Confirmar cron y secreto configurados en el proveedor de despliegue.
- > [!question] Confirmar si `pos` y `pos-terminal` son dos UX vigentes o una ruta heredada.
- > [!question] Confirmar estado real de instaladores, release y backend en máquinas de usuario.
- > [!question] Alinear `DIAGNOSTICO_FACTURACION_FACTUS.md` y otros documentos raíz con los cambios recientes; algunos describen fallos que el árbol actual parece abordar.

## Alcance de esta lista

El repositorio tiene cambios sin confirmar. No asumir severidad, impacto de producción ni que estas observaciones sean bugs reproducibles hasta contrastarlas con el despliegue y pruebas vigentes.
