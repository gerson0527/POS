---
tags:
  - modulo/backup
  - datos
estado: documentada
ruta-codigo:
  - app/api/backup/route.ts
  - components/settings/BackupSection.tsx
  - lib/backup/catalog.ts
  - lib/backup/export.ts
  - lib/backup/sql.ts
---

# Backup

## Exportación

`POST /api/backup` requiere usuario con rol ADMIN o MANAGER. Valida alcance (`all` o lista de tablas) y rango mensual opcional, registra auditoría y responde un flujo `application/sql`.

`lib/backup/catalog.ts` enumera tablas exportables, grupo, ámbito tenant y si se filtran por fecha. `exportBackupSql()` pagina por lotes de 200 por `id`, filtra por tenant/relación configurada y produce transacción SQL `BEGIN`/`COMMIT`.

## Límites

- Es una exportación de datos a SQL, no un servicio de almacenamiento cloud.
- En las rutas examinadas no hay endpoint de restauración.
- El catálogo cubre un conjunto explícito de tablas; una tabla nueva no queda incluida por defecto.
- El backup puede contener datos personales/comerciales y debe guardarse fuera del vault con controles de acceso.

Ver UI en ajustes y [[03-Datos/Modelo-de-datos]].
