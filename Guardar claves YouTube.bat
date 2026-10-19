@echo off
cd /d "%~dp0"
echo ==========================================
echo  Guardar claves de YouTube (secreto)
echo ==========================================
call node tools\youtube-claves.cjs
pause
