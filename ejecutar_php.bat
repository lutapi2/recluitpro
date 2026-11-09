@echo off
setlocal enabledelayedexpansion
title RecruitPro - Servidor PHP
cd /d "%~dp0"

echo ========================================================
echo          RecruitPro - Plataforma ATS en PHP
echo ========================================================
echo.

:: 1. Buscar PHP en PATH
where php >nul 2>nul
if %ERRORLEVEL% equ 0 (
    set "PHP_BIN=php"
    goto :INICIAR
)

:: 2. Buscar en rutas comunes de Windows
if exist "C:\xampp\php\php.exe" (
    set "PHP_BIN=C:\xampp\php\php.exe"
    goto :INICIAR
)
if exist "C:\php\php.exe" (
    set "PHP_BIN=C:\php\php.exe"
    goto :INICIAR
)
if exist "C:\tools\php\php.exe" (
    set "PHP_BIN=C:\tools\php\php.exe"
    goto :INICIAR
)
if exist "C:\Program Files\PHP\php.exe" (
    set "PHP_BIN=C:\Program Files\PHP\php.exe"
    goto :INICIAR
)
for /d %%D in (C:\laragon\bin\php\php-*) do (
    if exist "%%D\php.exe" (
        set "PHP_BIN=%%D\php.exe"
        goto :INICIAR
    )
)
if exist "%~dp0php\php.exe" (
    set "PHP_BIN=%~dp0php\php.exe"
    goto :INICIAR
)

:: Si no se encontró PHP
echo [AVISO] No se detecto php.exe en el PATH ni en C:\xampp\php.
echo.
echo Para ejecutar RecruitPro en PHP tienes 2 opciones sencillas:
echo   1. Abrir XAMPP y colocar esta carpeta en 'htdocs', o
echo   2. Descargar PHP para Windows (desde windows.php.net/download)
echo      y agregarlo al PATH o descomprimirlo en C:\xampp\php
echo.
echo Si ya tienes PHP instalado en otra carpeta, ingresa su ruta completa:
set /p USER_PHP="Ruta a php.exe (o Enter para salir): "
if not "%USER_PHP%"=="" (
    if exist "%USER_PHP%" (
        set "PHP_BIN=%USER_PHP%"
        goto :INICIAR
    )
)
pause
exit /b 1

:INICIAR
echo [+] Binario PHP detectado: %PHP_BIN%
echo [+] Servidor web: http://127.0.0.1:8000
echo [+] Router: router.php (API + Archivos Estaticos)
echo [+] Base de datos: recruitpro.db (SQLite PDO)
echo.
echo Abriendo navegador en http://127.0.0.1:8000 ...
start "" "http://127.0.0.1:8000"
echo Presiona Ctrl+C para detener el servidor.
echo.
"%PHP_BIN%" -S 127.0.0.1:8000 router.php
pause
