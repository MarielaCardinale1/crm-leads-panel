@echo off
cd /d "%~dp0"
set CUENTA=mariela.cardinale@gmail.com
echo ==========================================
echo  Publicar CRM Leads (panel + funciones)
echo ==========================================
echo.
if not exist "node_modules" (
  echo Instalando dependencias del panel...
  call npm install || goto :error
)
rem Siempre: asi se instalan las librerias nuevas de los agentes
(
  echo Instalando dependencias de las funciones...
  pushd functions
  call npm install || (popd & goto :error)
  popd
)
echo Corriendo tests del Lead Scoring...
call npm test || goto :error
echo Revisando que la cuenta %CUENTA% este agregada a Firebase...
call npx --yes firebase-tools login:list | find /i "%CUENTA%" >nul
if errorlevel 1 (
  echo No esta. Se va a abrir el navegador: entra con %CUENTA%.
  call npx --yes firebase-tools login:add %CUENTA% || goto :error
)
echo Compilando el panel...
call npm run build || goto :error
echo.
echo Publicando panel y funciones (codebase leads)...
call npx --yes firebase-tools deploy --only hosting:leads,functions:leads --account %CUENTA% || goto :error
echo.
rem La direccion sale del perfil del proyecto (functions\project.json), no de este archivo
for /f "usebackq delims=" %%u in (`node -p "require('./functions/brand').brand.panelUrl"`) do set PANEL=%%u
echo Listo: %PANEL%
pause
exit /b 0

:error
echo.
echo ERROR: algo fallo. No se publico nada nuevo. Si pidio login, entra con la cuenta %CUENTA%.
pause
exit /b 1
