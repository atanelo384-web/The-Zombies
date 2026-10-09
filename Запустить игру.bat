@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules\electron (
  echo Устанавливаю зависимости, это нужно один раз...
  call npm install
)
call npm start
