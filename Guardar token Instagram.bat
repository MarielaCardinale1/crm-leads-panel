@echo off
cd /d "%~dp0"
echo ==========================================
echo  Guardar token de Instagram (secreto)
echo ==========================================
call node tools\instagram-token.js
pause
