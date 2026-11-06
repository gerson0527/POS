---
tags:
  - moc
  - proyecto/pos
estado: documentada
ruta-codigo:
  - package.json
  - app/
  - lib/
  - lib/db/schema/
  - src-tauri/
---

# POS Retail Enterprise DIAN

Índice del proyecto documentado desde el árbol de trabajo observado el 2026-11-06. El nombre del producto aparece en `src-tauri/tauri.conf.json`; `package.json` conserva `name: my-project`, por lo que la identidad definitiva del paquete queda pendiente.

> [!warning] Estado del repositorio
> La exploración encontró numerosos cambios y archivos nuevos sin confirmar. Estas notas describen el árbol presente, no certifican que coincida con una versión publicada o con un estado final aprobado.

## Arquitectura

- [[01-Arquitectura/Arquitectura-general]]
- [[01-Arquitectura/Stack-y-dependencias]]
- [[01-Arquitectura/Estructura-del-repositorio]]

## Módulos funcionales

- [[02-Modulos/Autenticacion-y-tenancy]]
- [[02-Modulos/POS-ventas-y-pagos]]
- [[02-Modulos/Caja-y-cierres]]
- [[02-Modulos/Catalogo-e-inventario]]
- [[02-Modulos/Clientes-y-credito]]
- [[02-Modulos/Compras-y-proveedores]]
- [[02-Modulos/Facturacion-Factus-y-DIAN]]
- [[02-Modulos/Cola-fiscal-y-reintentos]]
- [[02-Modulos/Devoluciones]]
- [[02-Modulos/Reportes-y-PDF]]
- [[02-Modulos/Backup]]
- [[02-Modulos/Asistente-y-canales]]
- [[02-Modulos/Usuarios-y-configuracion]]

## Datos e interfaces

- [[03-Datos/Modelo-de-datos]]
- [[03-Datos/Migraciones]]
- [[04-Interfaces/API-y-rutas]]

## Operación

- [[05-Operacion/Variables-de-entorno]]
- [[05-Operacion/Desarrollo-local]]
- [[05-Operacion/Pruebas-y-calidad]]
- [[05-Operacion/Docker-y-despliegue]]
- [[05-Operacion/Escritorio-Tauri]]
- [[05-Operacion/Cron-y-tareas-programadas]]

## Decisiones y notas

- [[06-Decisiones-y-pendientes/Decisiones-tecnicas]]
- [[06-Decisiones-y-pendientes/Deuda-tecnica-y-por-verificar]]
- [[07-Plantillas/Plantilla-nota-tecnica]]

## Cómo usar este vault

- Las rutas enlazadas son fuentes de verdad; las notas describen su comportamiento observado, no reemplazan el código.
- `estado: documentada` significa que se encontró evidencia en el repositorio, no que la función esté validada en producción.
- Los puntos sin evidencia suficiente se señalan con `> [!question] Por verificar`.
- No guardar aquí secretos, `.env`, respaldos de clientes, instaladores ni artefactos generados.
