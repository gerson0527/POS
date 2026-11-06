@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM POS ENTERPRISE DIAN // SCRIPT DE INICIO TAURI 2.X DESKTOP
REM Inicia el contenedor nativo de escritorio Tauri 2.x (Rust + SQLite)
REM
REM Ejecuta automaticamente:
REM   1. Verificacion de Rust/Cargo
REM   2. Verificacion de Base de Datos y .env (con Setup interactivo)
REM   3. Compilacion de paquetes compartidos del monorepo
REM   4. Generacion de iconos Tauri (si faltan)
REM   5. Recordatorio de facturacion DIAN
REM   6. Arranque de la aplicacion Tauri
REM ============================================================

echo.
echo ========================================================
echo  POS ENTERPRISE // INICIO ENTORNO TAURI 2.X DESKTOP
echo ========================================================
echo.

cd /d "%~dp0"

REM Redireccionar directorio target de Rust fuera de la carpeta Downloads para evitar bloqueos de Windows Defender (os error 32)
set CARGO_TARGET_DIR=%LOCALAPPDATA%\Temp\pos-tauri-target

REM Cerrar procesos de compilacion Rust bloqueados previamente
taskkill /F /IM cargo.exe >nul 2>&1
taskkill /F /IM rustc.exe >nul 2>&1

REM Liberar puerto 3000 de servidores dev previos para que Next.js inicie limpiamente
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM 1. Verificar disponibilidad de Rust y Cargo
echo [1/6] Verificando entorno de compilacion Rust nativo...
where cargo >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo       AVISO: Cargo / Rust no se encuentra en el PATH.
    echo       Por favor instale Rust desde https://rustup.rs para ejecutar el modo nativo.
    echo.
) else (
    echo       OK - Entorno Rust detectado.
)
echo.

REM 2. Verificar conexion a base de datos PostgreSQL y .env
echo [2/6] Verificando conexion a Base de Datos PostgreSQL...
if not exist ".env" (
    echo.
    echo       AVISO: No se encontro el archivo .env de configuracion.
    set /p RUN_SETUP="      Deseas ejecutar el Asistente de Configuracion de Base de Datos ahora? (S/n): "
    if /i not "!RUN_SETUP!"=="n" (
        call setup-database.bat
    )
)

node scripts/check-db.js
if errorlevel 1 (
    echo.
    echo       AVISO CRITICO: La base de datos no respondio correctamente.
    set /p RUN_SETUP_RETRY="      Deseas ejecutar el Asistente para configurar la conexion ahora? (S/n): "
    if /i not "!RUN_SETUP_RETRY!"=="n" (
        call setup-database.bat
        echo.
        echo       Reverificando base de datos...
        node scripts/check-db.js
    )
) else (
    REM Si la BD responde, verificar configuracion de Factus/DIAN
    echo.
    echo       Verificando configuracion de Factus/DIAN por tenant...
    node scripts/check-factus-config.js
)
echo.

REM 3. Verificar que los paquetes del monorepo esten construidos
echo [3/6] Verificando paquetes compartidos del monorepo...
if not exist "packages\shared-domain\dist" (
    echo       Construyendo @pos/shared-domain...
    call npx tsc -p packages/shared-domain/tsconfig.json
)
if not exist "packages\sync-engine\dist" (
    echo       Construyendo @pos/sync-engine...
    call npx tsc -p packages/sync-engine/tsconfig.json
)
if not exist "packages\security-vault\dist" (
    echo       Construyendo @pos/security-vault...
    call npx tsc -p packages/security-vault/tsconfig.json
)
if not exist "packages\telemetry-analytics\dist" (
    echo       Construyendo @pos/telemetry-analytics...
    call npx tsc -p packages/telemetry-analytics/tsconfig.json
)
if not exist "packages\backup-recovery\dist" (
    echo       Construyendo @pos/backup-recovery...
    call npx tsc -p packages/backup-recovery/tsconfig.json
)
echo       OK - Paquetes del monorepo listos.
echo.

REM 4. Generar iconos requeridos por tauri-build si no existen
echo [4/6] Verificando iconos Tauri...
if not exist "src-tauri\icons\icon.ico" (
    echo       Generando iconos Tauri...
    call node scripts/generate-tauri-icons.js
) else (
    echo       OK - Iconos Tauri presentes.
)
echo.

REM 5. Aviso importante sobre configuracion DIAN
echo [5/6] Recordatorio de facturacion electronica...
echo       Para que las facturas se transmitan correctamente a la DIAN:
echo         - Configura las credenciales de Factus en /dashboard/settings
echo         - Selecciona un rango de numeracion valido (usa "Listar rangos del proveedor")
echo         - Verifica que tus productos tengan precio unitario ^> 0
echo.

REM 6. Iniciar entorno Tauri Desktop
echo [6/6] Iniciando aplicacion de escritorio Tauri 2.x...
echo.
echo   Modo:         Tauri 2.x Native Desktop + SQLite WAL
echo   Hardware:     Drivers ESC/POS, Balanza RS232, Cajon RJ11
echo   Transmision:  Outbox Sync Daemon
echo.
echo ========================================================
echo.

call npm run tauri:dev

endlocal
