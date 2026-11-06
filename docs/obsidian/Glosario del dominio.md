---
tipo: referencia
tags:
  - dominio
  - glosario
---

# Glosario del dominio

| Término | Significado en este proyecto |
|---|---|
| Tenant | Empresa que usa el POS. La sesión debe resolver el tenant antes de operar sobre sus datos. |
| Base master | PostgreSQL compartido para identidad/plataforma y resolución de empresa. |
| Base tenant | Base separada de negocio asociada con una empresa en el modelo web. |
| Turno de caja | Sesión operativa que agrupa apertura, ventas, movimientos y cierre de caja. |
| Ticket interno | Comprobante POS con consecutivo local (REC). No equivale a una factura electrónica DIAN. |
| Factura electrónica | Documento transmitido a DIAN por medio del proveedor Factus, con estado fiscal y CUFE cuando aplica. |
| Rango Factus | Numeración fiscal electrónica configurada en el proveedor. Independiente del consecutivo local REC. |
| `fiscal_outbox` | Cola durable para emitir/reintentar/reconciliar documentos fiscales después de completar la venta. No es BullMQ. |
| Modo MANUAL | Requiere aprobación/transmisión explícita; sus eventos no se procesan automáticamente por el cron. |
| Devolución | Registro sobre una venta completada; puede afectar existencias, caja o saldo del cliente. El esquema declara que no genera un documento electrónico DIAN. |
| Backup SQL | Exportación de tablas con ámbito por tenant y filtro temporal opcional; no confundir con una restauración automática. |
| Canal del asistente | Integración de mensajería (Telegram/WhatsApp) asociada con usuarios y tenant; los borradores requieren confirmación según el flujo. |

Para detalles del comportamiento implementado, seguir las rutas y archivos citados en [[docs/obsidian/Mapa del repositorio]].
