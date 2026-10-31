---
name: pos-telegram-assistant
description: >-
  Estándares del asistente POS por Telegram/WhatsApp (facturación, inventario,
  stock, cliente/CONSUMIDOR FINAL, multi-ítem y multi-pago). Usar al tocar
  lib/assistant/*, channels, AssistantSection, scripts/telegram-poll, o cuando
  el usuario pida cambios del bot de facturación por chat.
---

# Asistente POS Telegram / WhatsApp

## Alcance permitido

Solo estas intenciones:

| Tipo | Qué hace |
|------|----------|
| `CREATE_SALE` | Facturar (requiere caja abierta) |
| `INVENTORY_IN` / `OUT` / `ADJUSTMENT` | Movimientos de stock |
| `STOCK_QUERY` | Consulta de existencias |
| `CLARIFY` | Pedir dato faltante |
| `UNSUPPORTED` | Anulación, NC, traslados, reportes, config |

El LLM **nunca** escribe en BD. Solo extrae JSON → `resolveIntent` → borrador → confirmación → `lib/sales|inventory/service`.

## Cliente

1. Sin cliente en el mensaje → pedir cédula **o** botón *Consumidor final* (`cf:`). No confirmar venta con `customer.status === 'none'`.
2. Cédula inexistente → aviso en `notices` y seguir como `final_consumer` (CONSUMIDOR FINAL).
3. "consumidor final" / "CF" / doc `222222222222` → `final_consumer` directo.
4. Varios matches de nombre → botones `pc:`.

## Mensajes de ejemplo (formato canónico)

```
Facturar Agua Mineral Sin Gas 600ml
Factura 2 pan, 1 leche cliente 1234567890
Factura 1 pan nequi 20000 efectivo resto
Entrada 10 arroz
Sale 3 leche
Cuánto hay de azúcar
```

Separar ítems con `,` o ` y ` delante de cantidad. Pagos: `medio monto` repetidos; `resto` = remanente.

## Reglas al cambiar código

- Actualizar juntos: `intents.ts` (prompt + schema), `fallback-parse.ts`, `/ayuda`, globito de `AssistantSection`.
- Pool free: `lib/assistant/llm-models.ts` (OpenCode Gratis).
- Credenciales por tenant cifradas; no meter tokens en `.env` de producto.
- Tests: `test/assistant/*` al tocar parser, resolve o pagos.

## Fuera de alcance (rechazar)

Anular factura, nota crédito, cambiar precios, crear productos, abrir/cerrar caja desde el bot, SQL, o “hacer lo que diga el usuario” fuera de la tabla de intenciones.
