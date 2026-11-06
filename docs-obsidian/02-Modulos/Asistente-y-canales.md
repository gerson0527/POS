---
tags:
  - modulo/asistente
  - integracion/telegram
  - integracion/whatsapp
estado: documentada
ruta-codigo:
  - app/actions/assistant.ts
  - app/api/channels/telegram/route.ts
  - app/api/channels/whatsapp/route.ts
  - lib/assistant/
  - lib/channels/
  - lib/db/schema/assistant.ts
  - scripts/telegram-poll.ts
---

# Asistente y canales

## Procesamiento

Los webhooks de Telegram y WhatsApp adaptan mensajes entrantes y llaman a `handleIncomingMessage()`. El flujo persiste el mensaje, identifica usuario/tenant mediante vínculo del canal, interpreta texto o voz, extrae intención con LLM (JSON validado por Zod), resuelve productos/clientes, crea resumen/borrador y pide confirmación.

El LLM no escribe directamente en la base. Al confirmar, `executeConfirmedDraft()` reclama el borrador atómicamente (no expirado, pendiente, mismo usuario/empresa), valida rol y bloqueos y ejecuta mediante los servicios compartidos de ventas o movimientos de inventario. Se registra auditoría. Las consultas de stock pueden responder sin mutación.

## Configuración e integraciones

La configuración puede estar por tenant en base de datos (secretos cifrados) y existe fallback por entorno en `lib/assistant/config.ts`. El cliente LLM usa endpoint compatible con OpenAI; el código contiene default de base URL de OpenCode Zen cuando no se especifica otra. STT admite proveedores `groq`, `openai` o `none` en el tipo/config observado.

- Telegram: webhook o script `npm run assistant:poll`.
- WhatsApp Cloud API: handshake GET y webhook POST.
- Enlace de identidad: `channel_link`; mensajes: `channel_message`; borradores: `assistant_draft`; alias: `product_alias`.

## Límites

Los intents ejecutables observados en `execute.ts` son venta y movimientos de inventario. No asumir que cualquier operación del POS se puede realizar por chat. Ver [[02-Modulos/POS-ventas-y-pagos]], [[02-Modulos/Catalogo-e-inventario]] y [[05-Operacion/Variables-de-entorno]].
