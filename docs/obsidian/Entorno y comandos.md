---
tipo: guia
tags:
  - desarrollo
  - operaciones
---

# Entorno y comandos

## Requisitos

- Node.js y npm compatibles con `package-lock.json`.
- PostgreSQL accesible para desarrollo web, o la configuración local usada por el equipo.
- En Windows, herramientas Rust/Tauri para compilar el escritorio.

## Configuración

1. Instalar dependencias con `npm ci`.
2. Crear `.env` local a partir de `.env.example` y sustituir todos los valores ficticios.
3. Configurar `DATABASE_URL` (o `POSTGRES_*`) y los secretos de autenticación/cifrado.
4. No incluir `.env`, tokens, credenciales Factus, dumps SQL o datos de clientes en notas, adjuntos ni commits.
5. Las credenciales de Factus y del asistente se configuran por tenant desde el producto; no deben copiarse a esta nota.

En escritorio, la aplicación empaqueta un backend de producción y PostgreSQL privado; revisar los scripts Tauri antes de asumir que el `.env` del entorno de desarrollo se comparte con la instalación.

## Comandos npm

| Comando | Uso |
|---|---|
| `npm run dev` | Servidor Next.js de desarrollo; ejecuta `predev` y el diagnóstico suave de DB |
| `npm run build` | Build Next.js y preparación de distribución Tauri |
| `npm run build:desktop` | Build de escritorio con preparación del paquete PostgreSQL |
| `npm run tauri:dev` | Ejecutar app Tauri en desarrollo |
| `npm run tauri:build` | Crear instalador de escritorio |
| `npm run typecheck` | Comprobar TypeScript |
| `npm test` | Ejecutar la suite Vitest |
| `npm run lint` | Ejecutar ESLint |
| `npm run db:doctor` | Diagnosticar configuración/conectividad de base de datos |
| `npm run db:migrate` | Aplicar migraciones de desarrollo |
| `npm run db:generate` | Generar migraciones Drizzle |
| `npm run db:studio` | Abrir Drizzle Studio |
| `npm run assistant:poll` | Ejecutar el poller de Telegram |

Ver `scripts` de `package.json` como fuente de verdad: los comandos pueden evolucionar.

## Bases de datos

- El servicio principal usa PostgreSQL y Drizzle (`lib/db/index.ts`).
- `lib/db/tenant-connection.ts` documenta el patrón de base master más una base por tenant.
- El runtime Tauri gestiona PostgreSQL privado desde `src-tauri/src/postgres.rs`.
- Revisar `drizzle.config.ts`, `lib/db/migrate.ts` y `scripts/db-migrate.ts` antes de modificar el proceso de migración.

## Verificación antes de entregar cambios

Ejecutar los selectores pertinentes para el cambio. Para una revisión general:

```powershell
npm run typecheck
npm test
npm run lint
```

En cambios de compilación o empaquetado, añadir `npm run build` o `npm run build:desktop`. No ejecutar migraciones destructivas sobre datos compartidos sin autorización.
