---
tags:
  - operaciones
  - configuracion
  - secretos
estado: documentada
ruta-codigo:
  - .env.example
  - lib/auth.ts
  - lib/security/encrypt.ts
  - lib/assistant/config.ts
  - lib/invoicing/factus-http.ts
  - lib/reports/render.ts
  - src-tauri/src/backend.rs
---

# Variables de entorno

Esta nota registra nombres, no valores. `.env.example` es la lista base; el código lee variables adicionales según plataforma e integración. Nunca copiar aquí valores de `.env`.

## Nombres asignados en `.env.example`

`NODE_ENV`, `PORT`, `APP_PORT`, `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ENCRYPTION_KEY`, `PLATFORM_ADMIN_EMAILS`, `CRON_SECRET`, `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `FACTUS_HTTP_TIMEOUT_MS`.

En el mismo ejemplo aparecen comentados nombres de compatibilidad/optativos: `DIAN_SOFTWARE_ID`, `DIAN_SOFTWARE_PIN`, `DIAN_CERTIFICATE`, `DIAN_CERTIFICATE_PASSWORD`, `DIAN_ENVIRONMENT`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `ASSISTANT_POLL_TENANT_ID`.

## Variables adicionales leídas por código

| Grupo | Nombres |
|---|---|
| App/Auth/hosting | `POS_DESKTOP_ENV_FILE`, `POS_DATABASE_MODE`, `POS_DATABASE_NAME`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `V0_RUNTIME_URL`, `DATABASE_URL_UNPOOLED` |
| Tests DB | `TEST_DATABASE_URL`, `RUN_DB_TESTS` |
| Semilla y setup | `SETUP_ADMIN_EMAIL`, `SETUP_ADMIN_NAME`, `SETUP_ADMIN_PASSWORD`, `SETUP_COMPANY_NAME`, `SETUP_COMPANY_NIT`, `SETUP_COMPANY_EMAIL`, `SETUP_COMPANY_PHONE`, `SETUP_COMPANY_ADDRESS` |
| Asistente LLM/STT | `ASSISTANT_ENABLED`, `ASSISTANT_DRAFT_TTL_MINUTES`, `ASSISTANT_LLM_API_KEY`, `ASSISTANT_LLM_BASE_URL`, `ASSISTANT_LLM_MODEL`, `ASSISTANT_LLM_TIMEOUT_MS`, `ASSISTANT_STT_PROVIDER`, `ASSISTANT_STT_API_KEY`, `ASSISTANT_STT_MODEL`, `ASSISTANT_STT_BASE_URL` |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_BOT_USERNAME` |
| WhatsApp | `WHATSAPP_DISPLAY_PHONE` |
| Render PDF | `LAMBDA_TASK_ROOT`, `VERCEL_REGION`, `PUPPETEER_SANDBOX` |
| Rama heredada | `TAURI_DB_PATH` (consultada por `tenant-connection.ts`; no se halló uso activo de `getTenantDb()` en otros módulos) |

`lib/assistant/config.ts` también lee variables WhatsApp, pese a que varios nombres aparecen solo comentados en `.env.example`. `src-tauri` mantiene su propio `.env` en el directorio de datos de la app; `POS_DATABASE_MODE` indica si usa PostgreSQL del sistema (`system-local`), privado incluido (`bundled`) o remoto (`remote`), y `POS_DATABASE_NAME` registra el nombre elegido.

## Secretos y configuración por tenant

Factus y el asistente pueden guardar credenciales por tenant cifradas en BD; no deben pegarse a esta nota. `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, contraseñas y tokens son sensibles. `ENCRYPTION_KEY` es obligatoria para cifrado y rotarla sin migración puede impedir leer los valores guardados.

Para definiciones y defaults, verificar el punto de uso indicado en `ruta-codigo`; esta lista no afirma que todas las variables estén configuradas en despliegue.
