---
tags:
  - operaciones
  - cron
  - fiscal
estado: documentada
ruta-codigo:
  - vercel.json
  - app/api/cron/fiscal-outbox/route.ts
  - lib/fiscal/outbox.ts
  - scripts/telegram-poll.ts
  - package.json
---

# Cron y tareas programadas

## Cola fiscal

`vercel.json` programa `/api/cron/fiscal-outbox` con `0 6 * * *`. El endpoint acepta GET/POST, comprueba `CRON_SECRET` y procesa hasta 25 registros por llamada. El worker limita cada lote a 50 y aplica backoff/reconciliación por evento.

La emisión automática puede intentarse también al completar venta en modo `AUTO`; el cron cubre pendientes posteriores. El modo `MANUAL` no es reclamado por el worker hasta transmisión explícita. Ver [[02-Modulos/Cola-fiscal-y-reintentos]].

## Telegram polling

Existe `npm run assistant:poll`, que ejecuta `scripts/telegram-poll.ts`. El webhook Telegram también está implementado. No se encontró una programación de polling en `vercel.json`; la operación de ese script depende de invocación externa.

> [!question] Por verificar
> Confirmar en cada despliegue si el cron de Vercel está habilitado/soportado por el plan y cuál es su zona horaria efectiva; configurar secreto coincidente sin incluir su valor en estas notas.
