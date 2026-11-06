---
tags:
  - operaciones
  - despliegue
  - docker
estado: documentada
ruta-codigo:
  - Dockerfile
  - Dockerfile.dev
  - docker-compose.yml
  - docker-compose.override.yml
  - vercel.json
  - next.config.mjs
  - scripts/db-migrate.ts
---

# Docker y despliegue

## Docker

El `Dockerfile` usa Node 22 Alpine, instala dependencias, ejecuta `npm run build`, empaqueta el output standalone y Chromium del sistema para Puppeteer. El contenedor corre con usuario `nextjs`, escucha puerto 3000 y ejecuta migraciones antes de `server.js`.

`docker-compose.yml` define la app en puerto host `APP_PORT` (por defecto 3001) y PostgreSQL `16-alpine` con volumen persistente y healthcheck. No es el mismo major que el PostgreSQL 17 empaquetado para el runtime Tauri.

## Vercel

`vercel.json` define `buildCommand: npm run db:migrate:deploy && npm run build` y cron fiscal `0 6 * * *`. `scripts/db-migrate.ts` omite migraciones si `VERCEL_ENV` está definido y no es production; en producción prefiere `DATABASE_URL_UNPOOLED` a `DATABASE_URL`.

`next.config.mjs` configura `output: standalone`, recursos externos PDF y encabezados CSP/Permissions-Policy. La configuración del repositorio no demuestra que haya proyecto, secretos o cron habilitado en una cuenta concreta.

## Configuración e incertidumbres

Se necesita `.env` adecuado para el destino. No incluirlo en imágenes públicas, documentos o commits. Confirmar proveedores, dominios, variables y backups en el entorno real antes del despliegue.

Ver [[05-Operacion/Variables-de-entorno]], [[03-Datos/Migraciones]], [[05-Operacion/Cron-y-tareas-programadas]] y [[05-Operacion/Escritorio-Tauri]].
