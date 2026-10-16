@echo off
setlocal

REM ============================================================
REM POS DIAN // SCRIPT DE INICIO LOCAL (sin Docker)
REM Mata cualquier instancia previa de Next.js dev y arranca
REM ============================================================

echo.
echo ========================================================
echo  POS DIAN // INICIO LOCAL
echo ========================================================
echo.

REM Cerrar instancias previas de Next.js dev en puerto 3000
echo [1/3] Cerrando instancias previas...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%P /F >nul 2>&1
)

REM Cerrar procesos node residuales que esten corriendo npm/next
for /f "tokens=2 delims=," %%P in ('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH 2^>nul ^| findstr /I "node.exe"') do (
    echo       - Cerrando PID %%P
    taskkill /PID %%P /F /T >nul 2>&1
)

REM Limpiar terminal actual
cls

REM Verificar puerto 3000 libre
echo [2/5] Verificando puerto 3000...
netstat -ano | findstr :3000 | findstr LISTENING >nul
if not errorlevel 1 (
    echo       AVISO: puerto 3000 ocupado por PID
    netstat -ano | findstr :3000 | findstr LISTENING
) else (
    echo       OK - Puerto 3000 libre
)
echo.

REM Verificar conexion a base de datos PostgreSQL
echo [3/5] Verificando conexion a Base de Datos PostgreSQL...
node scripts\archive\check-db.js
if errorlevel 1 (
    echo.
    echo       AVISO CRITICO: La base de datos no respondio correctamente.
    echo       Verifique que el servicio PostgreSQL este iniciado en el puerto 5432.
    echo.
) else (
    echo.
    echo       Verificando configuracion de Factus/DIAN por tenant...
    node scripts/check-factus-config.js
)
echo.

REM Recordatorio de configuracion DIAN
echo [4/5] Recordatorio de facturacion electronica...
echo       Para que las facturas se transmitan a la DIAN, configura en /dashboard/settings:
echo         - Client ID, Client Secret, usuario y contrasena de Factus
echo         - Un rango de numeracion valido (usa "Listar rangos del proveedor")
echo         - Tus productos deben tener precio unitario ^> 0
echo.

REM Arrancar app
echo [5/5] Iniciando Next.js dev...
echo.
echo   URL:      http://localhost:3000
echo   Base DB:  pruebas_POS (PostgreSQL 5432)
echo.
echo   Para detener: cierra esta ventana o Ctrl+C
echo ========================================================
echo.

cd /d "%~dp0"

REM Capturar logs a archivo para no perderlos al cerrar ventana
REM Abrir navegador 5 segundos despues para dar tiempo al server
start "" cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:3000"

REM Ejecutar npm dev con salida a consola
call npm run dev

endlocal
