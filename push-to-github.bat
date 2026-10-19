@echo off
setlocal
cd /d "%~dp0"
title Push CalciFy to GitHub
set "RT=%~dp0.runtime"
set "PATH=%RT%\git\cmd;%RT%\gh\bin;%PATH%"

rem Use installed Git / GitHub CLI if present, otherwise portable copies in .runtime
where git >nul 2>nul
if errorlevel 1 call :download "https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.1/MinGit-2.47.1-64-bit.zip" git
where gh >nul 2>nul
if errorlevel 1 call :download "https://github.com/cli/cli/releases/download/v2.63.2/gh_2.63.2_windows_amd64.zip" gh
where git >nul 2>nul || goto fail
where gh >nul 2>nul || goto fail

gh auth status >nul 2>nul
if not errorlevel 1 goto loggedin
echo.
echo  ==============================================================
echo   GitHub login: press Enter when asked, then paste the code
echo   shown here into the browser page that opens.
echo  ==============================================================
echo.
gh auth login -h github.com -p https -w -s repo
gh auth status >nul 2>nul || goto fail

:loggedin
gh auth setup-git
for /f "delims=" %%i in ('gh api user --jq .login') do set "GHLOGIN=%%i"
for /f "delims=" %%i in ('gh api user --jq .id') do set "GHID=%%i"

if not exist ".git" git init -q -b main
git config user.name "%GHLOGIN%"
git config user.email "%GHID%+%GHLOGIN%@users.noreply.github.com"
git add -A
git commit -q -m "CalciFy: build, save and share custom calculators" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" 2>nul

git remote get-url origin >nul 2>nul
if not errorlevel 1 goto push
gh repo create calcify --public --source . --remote origin --description "Build, save and share your own calculators" || goto fail

:push
git push -u origin main || goto fail
echo.
echo  Done! https://github.com/%GHLOGIN%/calcify
start "" https://github.com/%GHLOGIN%/calcify
pause
exit /b 0

:download
echo Downloading %~2, one time only...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; New-Item -ItemType Directory -Force '%RT%\%~2' | Out-Null; Invoke-WebRequest '%~1' -OutFile '%RT%\%~2.zip'; Expand-Archive '%RT%\%~2.zip' '%RT%\%~2' -Force; Remove-Item '%RT%\%~2.zip'"
exit /b 0

:fail
echo.
echo  Something went wrong. Take a screenshot of this window and send it to Claude.
pause
exit /b 1
