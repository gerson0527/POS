---
tags:
  - datos
  - migraciones
estado: documentada
ruta-codigo:
  - drizzle/
  - drizzle/meta/_journal.json
  - drizzle.config.ts
  - lib/db/migrate.ts
  - scripts/db-migrate.ts
  - package.json
---

# Migraciones

## Fuentes de verdad

- Declaraciones actuales: `lib/db/schema/index.ts`.
- SQL versionado: `drizzle/*.sql`.
- Journal: `drizzle/meta/_journal.json`.
- Configuración Drizzle: `drizzle.config.ts` (dialecto PostgreSQL, salida `drizzle/`).

En la exploración se encontraron migraciones `0000` hasta `0016`; `0016_customer_returns.sql` añade devoluciones en el árbol actual. El journal y los archivos deben revisarse juntos al cambiar esquema.

## Comandos

- Generar: `npm run db:generate`.
- Desarrollo: `npm run db:migrate`.
- Deploy: `npm run db:migrate:deploy` (`tsx scripts/db-migrate.ts`).
- `npm run db:push` existe, pero no sustituir la estrategia versionada sin decisión explícita.

`runMigrations()` llama al migrador de Drizzle. Puede adoptar una base preexistente registrando la migración inicial si ya hay tablas y no hay tabla de tracking; ver `lib/db/migrate.ts`. El script de deploy omite migraciones en Vercel cuando `VERCEL_ENV` no es production y prefiere `DATABASE_URL_UNPOOLED`.

> [!warning] Precaución
> Una migración cambia datos/esquema persistentes. No ejecutar contra producción sin backup, revisión del SQL y autorización. Esta nota no confirma que una migración se haya aplicado en un servidor.

Ver [[03-Datos/Modelo-de-datos]] y [[05-Operacion/Docker-y-despliegue]].
