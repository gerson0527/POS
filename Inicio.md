---
tipo: indice
proyecto: POS Retail Enterprise DIAN
tags:
  - pos
  - colombia
  - obsidian/inicio
---

# POS Retail Enterprise DIAN

Vault técnico del proyecto: aplicación POS multiempresa para comercio colombiano, con inventario, caja y facturación electrónica DIAN a través de Factus.

## Navegación

- [[ARQUITECTURA_POS_DIAN_COLOMBIA]] — arquitectura y límites funcionales vigentes.
- [[docs/obsidian/Mapa del repositorio]] — módulos, rutas y puntos de entrada del código.
- [[docs/obsidian/Entorno y comandos]] — puesta en marcha, variables y comandos habituales.
- [[docs/obsidian/Glosario del dominio]] — conceptos del POS, fiscalidad y tenancy.
- [[DIAGNOSTICO_FACTURACION_FACTUS]] — diagnóstico histórico; sus hallazgos requieren revalidación.

## Mapa rápido

| Área | Código |
|---|---|
| UI y rutas | `app/dashboard/`, `components/` |
| Escrituras y operaciones | `app/actions/`, `lib/` |
| Datos y migraciones | `lib/db/schema/`, `drizzle/` |
| Facturación/DIAN | `lib/invoicing/`, `lib/fiscal/`, `app/api/cron/fiscal-outbox/` |
| Desktop | `src-tauri/`, `scripts/prepare-*` |
| Pruebas | `test/` |

## Convenciones del vault

- Mantener las notas del proyecto bajo `docs/obsidian/`; no mover ni renombrar código para acomodarlo a Obsidian.
- Enlazar las fuentes de verdad en el repositorio en lugar de copiar implementaciones completas a las notas.
- No guardar secretos, archivos `.env`, datos de clientes ni respaldos de producción en el vault.
- Usar [[docs/obsidian/plantillas/Nota técnica]] como base para nuevas notas técnicas.

## Estado de la documentación

La arquitectura describe el árbol de trabajo observado el 2026-11-06, que incluye modificaciones sin confirmar. Antes de decisiones de producción, comprobar el archivo/flujo citado y la rama activa.
