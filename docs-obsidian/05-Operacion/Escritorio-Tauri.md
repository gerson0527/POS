---
tags:
  - operaciones
  - tauri
  - escritorio
estado: documentada
ruta-codigo:
  - src-tauri/tauri.conf.json
  - src-tauri/Cargo.toml
  - src-tauri/src/main.rs
  - src-tauri/src/backend.rs
  - src-tauri/src/postgres.rs
  - scripts/prepare-tauri-dist.js
  - scripts/prepare-postgres-dist.js
---

# Escritorio Tauri

## Empaquetado

`tauri.conf.json` fija el producto “POS Retail Enterprise DIAN”, versión `3.0.2`, ventana inicial 1280×800 y recursos `backend/` y `postgres-bundle/`. Antes de compilar ejecuta `npm run build:desktop`: build web, preparación backend standalone y distribución PostgreSQL.

`prepare-postgres-dist.js` descarga PostgreSQL Windows x64 con versión/checksum fijados en el script, verifica el archivo y prepara recursos. `prepare-tauri-dist.js` identifica el build standalone de Next, copia recursos/estáticos/migraciones y el runtime Node al bundle.

## Arranque

El comando Tauri `start_backend_server` asegura el PostgreSQL privado, guarda la URL en configuración local y arranca Next en `127.0.0.1:3000`. El proceso backend espera respuesta exitosa de `/api/health`; la ventana bootstrap redirige a setup o a la app.

El runtime `postgres.rs` declara PostgreSQL major 17, almacena estado/credenciales bajo el directorio local de datos de la app y no controla instalaciones externas.

## Diferenciar del código demostrativo

`src-tauri/src/main.rs` también expone comandos `create_local_sale`, impresión ESC/POS, pulso de cajón, lectura de báscula y sincronización; en el código leído devuelven datos sintéticos/logs, no implementan persistencia offline ni comunicación real con hardware. No deben documentarse como funciones productivas sin verificación adicional.

> [!question] Por verificar
> Confirmar firma/versión del instalador distribuido, pipeline de releases, rutas de datos por plataforma y si algún comando de hardware se reemplazó fuera de las fuentes inspeccionadas.

Ver [[05-Operacion/Desarrollo-local]] y [[05-Operacion/Docker-y-despliegue]].
