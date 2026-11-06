---
tags:
  - operaciones
  - pruebas
  - calidad
estado: documentada
ruta-codigo:
  - package.json
  - vitest.config.ts
  - tsconfig.json
  - test/
---

# Pruebas y calidad

## Comandos

- `npm run typecheck`: `tsc --noEmit`.
- `npm test`: `vitest run`.
- `npm run test:integration`: `vitest run test/integration`.
- `npm run lint`: `eslint .`.

## Organización observada

`test/` contiene carpetas `actions`, `assistant`, `auth`, `backup`, `cash`, `catalogs`, `credit`, `db`, `fiscal`, `integration`, `inventory`, `invoicing`, `pos`, `reports` y `returns`, además de pruebas de setup y build desktop.

Las pruebas de integración DB consultan `TEST_DATABASE_URL` y `RUN_DB_TESTS`; verificar esas variables y destino antes de ejecutarlas. `tsconfig.json` excluye `src-tauri`, `scripts/archive` y `packages` del typecheck principal.

No se fija un número de tests ni una garantía de cobertura: los resultados dependen del árbol y configuración actuales. Para cambios de build, sumar `npm run build` o `npm run build:desktop`.
