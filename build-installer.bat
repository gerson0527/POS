@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM POS ENTERPRISE DIAN // GENERADOR DE INSTALADOR TAURI 2.X
REM Compila la aplicacion de escritorio y genera el instalador
REM para Windows (.exe / .msi NSIS)
REM ============================================================

echo.
echo ========================================================
echo  POS ENTERPRISE // GENERADOR DE INSTALADOR DESKTOP
echo ========================================================
echo.

cd /d "%~dp0"

REM Redireccionar directorio target de Rust fuera de Downloads para evitar bloqueos de Windows Defender
set CARGO_TARGET_DIR=%LOCALAPPDATA%\Temp\pos-tauri-target

REM 1. Verificar Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta en el PATH.
    pause
    exit /b 1
)

REM 2. Verificar Cargo / Rust
where cargo >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Rust / Cargo es requerido para compilar el instalador.
    echo Por favor instale Rust desde https://rustup.rs
    pause
    exit /b 1
)

REM 3. Paquetes del monorepo
echo [1/4] Compilando paquetes compartidos...
if not exist "packages\shared-domain\dist" call npx tsc -p packages/shared-domain/tsconfig.json
if not exist "packages\sync-engine\dist" call npx tsc -p packages/sync-engine/tsconfig.json
if not exist "packages\security-vault\dist" call npx tsc -p packages/security-vault/tsconfig.json
if not exist "packages\telemetry-analytics\dist" call npx tsc -p packages/telemetry-analytics/tsconfig.json
if not exist "packages\backup-recovery\dist" call npx tsc -p packages/backup-recovery/tsconfig.json
echo       OK - Paquetes compilados.
echo.

REM 4. Iconos y Activos Web Frontend
echo [2/4] Verificando iconos y contenedor web frontend...
if not exist "src-tauri\icons\icon.ico" (
    call node scripts/generate-tauri-icons.js
)
REM tauri:build compila Next y prepara el backend standalone antes de empaquetar.
echo       OK - Iconos verificados; el backend se preparara durante la compilacion.
echo.

REM 5. Generacion del instalador nativo
echo [3/4] Generando instalador de produccion de Tauri...
echo       (Esto puede tardar varios minutos la primera vez)...
echo.
call npm run tauri:build

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Hubo un problema al generar el instalador.
    pause
    exit /b %errorlevel%
)

REM 6. Copiar instaladores a la carpeta local del proyecto
echo.
echo [4/4] Copiando instaladores a la carpeta del proyecto 'dist-installers\'...
if not exist "dist-installers" mkdir "dist-installers"

if exist "%CARGO_TARGET_DIR%\release\bundle\nsis\*.exe" (
    copy /y "%CARGO_TARGET_DIR%\release\bundle\nsis\*.exe" "dist-installers\" >nul
)
if exist "%CARGO_TARGET_DIR%\release\bundle\msi\*.msi" (
    copy /y "%CARGO_TARGET_DIR%\release\bundle\msi\*.msi" "dist-installers\" >nul
)

echo.
echo ========================================================
echo  INSTALADORES LISTOS EN LA CARPETA DEL PROYECTO:
echo ========================================================
dir /b "dist-installers\"
echo.
echo Ubicacion completa:
echo   %~dp0dist-installers\
echo ========================================================
echo.

REM Abrir la carpeta de instaladores automaticamente en el explorador de Windows
start "" explorer.exe "%~dp0dist-installers"

pause
endlocal
