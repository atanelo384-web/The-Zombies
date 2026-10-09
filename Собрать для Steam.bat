@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules\electron call npm install
call npm run dist
echo.
echo Готово! Сборка лежит в папке release
pause
