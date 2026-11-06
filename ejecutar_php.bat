@echo off
chcp 65001 > nul
title RecruitPro CECAR - Servidor PHP Puro
cls
echo ========================================================
echo    RECRUITPRO CECAR - SERVIDOR LOCAL PHP PURO
echo ========================================================
echo.

set PHP_BIN=
if exist "C:\xampp\php\php.exe" (
    set "PHP_BIN=C:\xampp\php\php.exe"
) else (
    where php >nul 2>nul
    if %errorlevel% equ 0 (
        set "PHP_BIN=php"
    )
)

if "%PHP_BIN%"=="" (
    echo [ERROR] No se encontro PHP en C:\xampp\php\php.exe ni en el PATH.
    echo Por favor asegurese de tener XAMPP instalado.
    pause
    exit /b 1
)

echo Usando ejecutable: %PHP_BIN%
echo Servidor escuchando en: http://localhost:8000
echo.
echo Presione CTRL+C para detener el servidor.
echo ========================================================
echo.

start "" http://localhost:8000

"%PHP_BIN%" -S localhost:8000 router.php

pause
