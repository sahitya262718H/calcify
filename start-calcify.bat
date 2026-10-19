@echo off
setlocal
cd /d "%~dp0"
title CalciFy - http://localhost:8888

rem Use installed Node.js if there is one, otherwise a portable copy in .runtime
where node >nul 2>nul
if %errorlevel%==0 (
  set "NODE=node"
  goto run
)
set "NODE=%~dp0.runtime\node\node.exe"
if exist "%NODE%" goto run

echo Node.js is not installed. Downloading a portable copy, one time only, about 30 MB...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $v='v22.12.0'; New-Item -ItemType Directory -Force '.runtime' | Out-Null; Invoke-WebRequest ('https://nodejs.org/dist/' + $v + '/node-' + $v + '-win-x64.zip') -OutFile '.runtime\node.zip'; Expand-Archive '.runtime\node.zip' '.runtime' -Force; Rename-Item ('.runtime\node-' + $v + '-win-x64') 'node'; Remove-Item '.runtime\node.zip'"
if not exist "%NODE%" (
  echo.
  echo Download failed. Install Node.js LTS from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

:run
echo.
echo  CalciFy is starting at http://localhost:8888
echo  Keep this window open while you use it. Close it to stop the server.
echo.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8888"
"%NODE%" dev-server.mjs
pause
