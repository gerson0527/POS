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
  - src-tauri/capabilities/default.json
  - scripts/prepare-tauri-dist.js
  - scripts/prepare-postgres-dist.js
  - app/desktop-setup/page.tsx
  - app/api/setup/route.ts
  - app/api/health/route.ts
  - app/api/ready/route.ts
---

# Escritorio Tauri

## Empaquetado

`tauri.conf.json` fija el producto “POS Retail Enterprise DIAN”, versión `3.0.3`, ventana inicial 1280×800 y recursos `backend/` y `postgres-bundle/`. Antes de compilar ejecuta `npm run build:desktop`: build web, preparación backend standalone y distribución PostgreSQL.

`prepare-postgres-dist.js` descarga PostgreSQL Windows x64 con versión/checksum fijados en el script, verifica el archivo y prepara recursos. `prepare-tauri-dist.js` identifica el build standalone de Next, copia recursos/estáticos/migraciones y el runtime Node al bundle.

## Primer inicio y base de datos

La ventana bootstrap arranca Next en `127.0.0.1:3000` y abre `/desktop-setup` hasta que se elija la base de datos. El asistente permite conectar un PostgreSQL ya instalado en este equipo (host/puerto/usuario/contraseña/base existente), usar el PostgreSQL privado incluido con nombre personalizable, o usar una URL PostgreSQL remota/nube. Los modos local instalado y remoto no inician el motor privado. La URL y la selección se guardan en el `.env` del directorio de datos local de la aplicación. La capability remota de Tauri limita la API nativa a ese origen local.

Después de probar la conexión, el asistente solicita los datos de empresa y la cuenta administradora solo si la base aún no tiene usuarios. Cambiar a otro nombre local crea una base nueva; las bases anteriores no se eliminan ni se copian. `/api/ready` comprueba que Next ya atiende solicitudes, aunque la base todavía no esté configurada; `/api/health` conserva la comprobación de base de datos.

El runtime `postgres.rs` declara PostgreSQL major 17 y almacena el clúster/credenciales bajo el directorio local de datos de la app; no controla instalaciones PostgreSQL externas. La selección remota debe ser accesible desde el equipo y contar con permisos para las migraciones.

## Diferenciar del código demostrativo

`src-tauri/src/main.rs` también expone comandos `create_local_sale`, impresión ESC/POS, pulso de cajón, lectura de báscula y sincronización; en el código leído devuelven datos sintéticos/logs, no implementan persistencia offline ni comunicación real con hardware. No deben documentarse como funciones productivas sin verificación adicional.

> [!question] Por verificar
> Confirmar firma/versión del instalador distribuido, pipeline de releases, rutas de datos por plataforma y si algún comando de hardware se reemplazó fuera de las fuentes inspeccionadas.

Ver [[05-Operacion/Desarrollo-local]] y [[05-Operacion/Docker-y-despliegue]].
