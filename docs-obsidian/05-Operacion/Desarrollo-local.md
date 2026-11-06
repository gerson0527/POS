---
tags:
  - operaciones
  - desarrollo
estado: documentada
ruta-codigo:
  - package.json
  - .env.example
  - scripts/db-doctor.ts
  - scripts/setup-wizard.ts
  - docker-compose.yml
---

# Desarrollo local

## Arranque

1. Instalar Node/npm compatibles con `package-lock.json`; `Dockerfile` usa Node 22.
2. Instalar dependencias (`npm ci`).
3. Crear `.env` local a partir de `.env.example`; completar conexión PostgreSQL y secretos usando valores propios.
4. Iniciar PostgreSQL local o Compose.
5. Aplicar migraciones con `npm run db:migrate`.
6. Ejecutar `npm run dev`. Su `predev` corre `db:doctor -- --soft`.

El setup web/desktop también incluye un wizard bajo `app/api/setup` y scripts de setup. Leer [[04-Interfaces/API-y-rutas]] antes de exponer ese endpoint.

## Comandos disponibles

| Comando | Efecto declarado |
|---|---|
| `npm run dev` | Next.js desarrollo, con diagnóstico DB previo |
| `npm start` | `next start` |
| `npm run db:doctor` | Diagnóstico de conexión/configuración DB |
| `npm run db:migrate` | Migraciones locales vía dotenv/tsx |
| `npm run db:seed` | Ejecuta el seed |
| `npm run db:studio` | Drizzle Studio |
| `npm run assistant:poll` | Poller Telegram usando `.env.local` y `.env` |

`npm run db:seed` puede crear un usuario admin con valores por defecto si no se pasan opciones/variables. Revisar `scripts/seed.ts`; no ejecutar en un entorno compartido sin controlar primero los datos de entrada. Esta documentación no publica contraseñas.

Ver [[05-Operacion/Variables-de-entorno]], [[03-Datos/Migraciones]] y [[05-Operacion/Docker-y-despliegue]].
