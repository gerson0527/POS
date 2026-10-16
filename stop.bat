@echo off
setlocal

REM ============================================================
REM POS DIAN // SCRIPT DE DETENCION
REM Cierra procesos de Next.js dev en puerto 3000
REM ============================================================

echo.
echo ========================================================
echo  POS DIAN // DETENER SERVICIO LOCAL
echo ========================================================
echo.

echo [1/2] Cerrando procesos Next.js dev...

REM Buscar procesos node.exe hijos de npm/next
for /f "tokens=2" %%P in ('tasklist /FI "WINDOWTITLE eq start.bat*" /FO CSV /NH 2^>nul ^| findstr /I "cmd.exe"') do (
    taskkill /PID %%P /F /T >nul 2>&1
)

REM Matar todos los node.exe (npm run dev)
for /f "tokens=2 delims=," %%P in ('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH 2^>nul') do (
    echo       - Cerrando node.exe PID %%P
    taskkill /PID %%P /F /T >nul 2>&1
)

REM Matar instancias de la aplicacion de escritorio Tauri
for /f "tokens=2 delims=," %%P in ('tasklist /FI "IMAGENAME eq pos-retail-desktop.exe" /FO CSV /NH 2^>nul') do (
    echo       - Cerrando Tauri Desktop PID %%P
    taskkill /PID %%P /F /T >nul 2>&1
)

REM Liberar puerto 3000 explícitamente
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    echo       - Liberando puerto 3000 (PID %%P)
    taskkill /PID %%P /F >nul 2>&1
)

echo.
echo [2/2] Verificando...
netstat -ano | findstr :3000 | findstr LISTENING >nul
if errorlevel 1 (
    echo       OK - Puerto 3000 libre
) else (
    echo       AVISO: puerto 3000 sigue ocupado
    netstat -ano | findstr :3000 | findstr LISTENING
)

echo.
echo Servicio detenido.
echo ========================================================
echo.

pause
endlocal
