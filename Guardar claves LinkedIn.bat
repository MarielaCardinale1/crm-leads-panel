@echo off
cd /d "%~dp0"
echo ==========================================
echo  Guardar claves de LinkedIn (secreto)
echo ==========================================
call node tools\linkedin-claves.cjs
pause
