@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules\ws (
  echo Устанавливаю зависимости, это нужно один раз...
  call npm install --omit=dev
)
node electron\server.js
pause
