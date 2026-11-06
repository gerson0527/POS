---
tags:
  - api
  - rutas
estado: documentada
ruta-codigo:
  - app/api/
  - app/api/ready/route.ts
  - app/actions/
  - proxy.ts
  - lib/api/
---

# API y rutas

## Regla general

La UI usa principalmente Server Actions. Los siguientes endpoints son los manejadores `route.ts` encontrados; la autenticación se ejecuta en cada handler o en `proxy.ts`, según se indica.

| Ruta | Métodos | Función y control observado |
|---|---|---|
| `/api/auth/[...all]` | Delegado a Better Auth | Inicio de sesión/registro y demás endpoints auth |
| `/api/health` | GET | `SELECT 1`; estado y uptime; respuesta 503 si DB falla |
| `/api/ready` | GET | Disponibilidad del proceso Next, sin depender de la conexión a BD |
| `/api/setup` | GET, POST | Diagnóstico/configuración inicial de BD y empresa; el escritorio permite elegir local/remota |
| `/api/backup` | POST | Exporta SQL; `requireActor(['ADMIN','MANAGER'])` |
| `/api/cron/fiscal-outbox` | GET, POST | Procesa cola; requiere `CRON_SECRET` |
| `/api/channels/telegram` | GET, POST | Estado/webhook; POST verifica secreto de webhook antes de recibir mensajes |
| `/api/channels/whatsapp` | GET, POST | Handshake Meta/webhook y resolución de tenant |
| `/api/reports/inventory-pdf` | GET, POST | Reporte PDF; valida sesión y tenant |
| `/api/v1/invoices` | GET, POST | API pública con Bearer API key y scopes `read`/`write` |

## API v1 de facturas

- GET soporta `limit`, `offset`, `status`; límites de paginación validados con Zod.
- POST acepta `saleId` y CUFE de 96 caracteres hexadecimales, requiere venta completada y persiste documento fiscal asociado al tenant de la API key.
- Este POST registra CUFE; no es el llamado de emisión a Factus.
- `proxy.ts` deja pasar la API key con forma Bearer reconocida; el route handler valida hash, estado, expiración y scope vía `validateAPIKey()`.

No se encontraron rutas REST equivalentes para todas las operaciones del POS: se exponen como acciones.

> [!question] Por verificar
> El manejador `/api/setup` no muestra una validación de sesión en el fragmento inspeccionado y su prefijo no está entre los prefijos protegidos generales. Confirmar el perímetro de red/uso previsto antes de exponerlo fuera del onboarding local.

Ver [[02-Modulos/Asistente-y-canales]], [[02-Modulos/Backup]] y [[02-Modulos/Cola-fiscal-y-reintentos]].
