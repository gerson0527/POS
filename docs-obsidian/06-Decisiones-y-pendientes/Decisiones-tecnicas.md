---
tags:
  - decisiones
  - arquitectura
estado: documentada
ruta-codigo:
  - package.json
  - app/actions/
  - lib/
  - lib/db/
  - lib/fiscal/outbox.ts
  - src-tauri/
  - Dockerfile
  - vercel.json
---

# Decisiones técnicas observadas

Esta nota separa elecciones visibles en el código de decisiones históricas aprobadas por el equipo.

| Decisión/elección implementada | Evidencia | Implicación |
|---|---|---|
| Monolito Next.js con App Router y Server Actions | `app/`, `app/actions/` | UI y lógica de servidor comparten despliegue |
| TypeScript estricto | `tsconfig.json` | Verificación de tipos mediante `npm run typecheck` |
| Drizzle/PostgreSQL | `lib/db/`, `drizzle/` | Esquemas TS más SQL versionado |
| Better Auth | `lib/auth.ts` | Sesiones persistidas y resolución de membresía |
| Factus como proveedor fiscal | `lib/invoicing/` | XML/CUFE/estado dependen de integración externa |
| Outbox fiscal propio | `fiscal_outbox`, `lib/fiscal/outbox.ts` | Commit de venta separado de reintentos externos |
| Aprobación `AUTO`/`MANUAL` | `tenant.dianTransmissionMode` | Posibilidad de retener eventos fiscales hasta transmisión manual |
| Tauri con Next local y PostgreSQL privado empaquetado | runtime Rust y scripts bundle | Escritorio no depende del PostgreSQL de Compose en su modo empaquetado |
| PDF con Puppeteer y Chromium compatible con serverless | `lib/reports/render.ts` | Requiere binario/runtime adecuado |
| Secretos tenant cifrados en BD | `lib/security/encrypt.ts` | `ENCRYPTION_KEY` debe conservarse/rotarse con plan |

## No confundir con decisiones confirmadas

La existencia de código legado para bases físicas por tenant no prueba que esa arquitectura esté conectada al `db` usado por las acciones actuales. Tampoco se encontró evidencia de una decisión de producción documentada que resuelva la divergencia entre comentarios y uso. Ver [[06-Decisiones-y-pendientes/Deuda-tecnica-y-por-verificar]].
