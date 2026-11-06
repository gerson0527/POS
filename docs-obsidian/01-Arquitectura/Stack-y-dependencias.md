---
tags:
  - arquitectura
  - dependencias
estado: documentada
ruta-codigo:
  - package.json
  - package-lock.json
  - tsconfig.json
  - next.config.mjs
  - src-tauri/Cargo.toml
---

# Stack y dependencias

## Versiones declaradas

| Área | Dependencia/configuración | Evidencia |
|---|---|---|
| Web | Next.js `16.2.6`, React `19` | `package.json` |
| Lenguaje | TypeScript `5.7.3`, `strict: true` | `package.json`, `tsconfig.json` |
| Datos | PostgreSQL, `pg`, Drizzle ORM `0.45.2`, Drizzle Kit `0.31.11` | `package.json`, `lib/db/` |
| Autenticación | Better Auth `1.6.25` | `package.json`, `lib/auth.ts` |
| Estilos | Tailwind CSS `4.3.3`, PostCSS | `package.json`, `postcss.config.mjs` |
| Pruebas | Vitest `5.0.5` | `package.json`, `vitest.config.ts` |
| Escritorio | Tauri CLI `2.1.0`, Rust | `package.json`, `src-tauri/` |

Las versiones con `^` indican rangos del manifiesto; el lockfile resuelve versiones instaladas concretas.

## Dependencias de producto relevantes

- `zod`: validación de entradas en API y flujos tipados.
- `nodemailer`: correo de bienvenida opcional.
- `puppeteer` y `@sparticuz/chromium`: render de reportes PDF.
- `recharts`: gráficos; `lucide-react`: iconos.
- `motion` y `@formkit/auto-animate`: animación UI.
- `next-themes`, `tailwind-merge`, `clsx`, `tw-animate-css`: tema y composición de clases.
- `qrcode.react`: render de QR en UI.
- `dotenv-cli` y `tsx`: configuración y ejecución de scripts TypeScript.

## Integraciones externas que aparecen en el código

- Facturación electrónica: API Factus v2, autenticación OAuth2.
- Persistencia: servidor PostgreSQL.
- Asistente: API LLM compatible con OpenAI y opciones de STT; canales Telegram y WhatsApp.
- Correo SMTP.
- Empaquetado local: binarios PostgreSQL para Windows en recursos Tauri.

No se deben confundir dependencias instaladas con servicios configurados en producción. Ver [[05-Operacion/Variables-de-entorno]] y [[05-Operacion/Docker-y-despliegue]].
