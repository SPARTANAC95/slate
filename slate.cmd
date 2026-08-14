@echo off
setlocal
rem Launch Slate. Builds it first if it has never been built.
set "ROOT=%~dp0"
set "EXE=%ROOT%src-tauri\target\release\slate.exe"

if not exist "%EXE%" (
  echo Slate has not been built yet - building now, this takes a few minutes...
  pushd "%ROOT%"
  if not exist "node_modules" call npm install || goto :failed
  call npm run build:app || goto :failed
  popd
)

if not exist "%EXE%" goto :failed
start "" "%EXE%"
exit /b 0

:failed
popd 2>nul
echo.
echo Could not build Slate. Run "npm run build:app" here to see the error.
pause
exit /b 1
