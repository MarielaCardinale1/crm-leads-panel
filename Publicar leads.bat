@echo off
cd /d "%~dp0"
echo ==========================================
echo  Publicar CRM Leads (panel + funciones)
echo ==========================================
echo.
if not exist "node_modules" (
  echo Instalando dependencias del panel...
  call npm install || goto :error
)
if not exist "functions\node_modules" (
  echo Instalando dependencias de las funciones...
  pushd functions
  call npm install || (popd & goto :error)
  popd
)
echo Corriendo tests del Lead Scoring...
call npm test || goto :error
echo Compilando el panel...
call npm run build || goto :error
echo.
echo Creando el sitio de hosting (si ya existe, sigue igual)...
call npx --yes firebase-tools hosting:sites:create marielacardinale-leads
echo.
echo Publicando panel y funciones (codebase leads)...
call npx --yes firebase-tools deploy --only hosting:leads,functions:leads || goto :error
echo.
echo Listo: https://marielacardinale-leads.web.app
pause
exit /b 0

:error
echo.
echo ERROR: algo fallo. No se publico nada nuevo. Si pidio login, ejecuta: npx firebase-tools login
pause
exit /b 1
