@echo off
setlocal enabledelayedexpansion

title POS Enterprise DIAN - Asistente de Base de Datos y Setup

cd /d "%~dp0"

echo.
echo ========================================================
echo  POS ENTERPRISE // ASISTENTE DE CONFIGURACION DE BD
echo ========================================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no se encuentra en el PATH.
    echo Por favor instale Node.js v20+ desde https://nodejs.org antes de continuar.
    pause
    exit /b 1
)

npx tsx scripts/setup-wizard.ts

echo.
pause
