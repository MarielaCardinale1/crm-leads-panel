@echo off
cd /d "%~dp0"
echo ==========================================
echo  Guardar token de Instagram (secreto)
echo ==========================================
echo Pega el token cuando lo pida y apreta Enter.
echo No se ve en pantalla: es normal.
echo.
call npx --yes firebase-tools functions:secrets:set IG_PAGE_TOKEN || goto :error
echo.
echo Listo: token guardado. Avisale a Claude.
pause
exit /b 0
:error
echo ERROR: no se guardo. Si pidio login: npx firebase-tools login
pause
exit /b 1
