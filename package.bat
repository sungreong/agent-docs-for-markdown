@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18+ is required to build the package.
  echo Download: https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required to build the package.
  pause
  exit /b 1
)

if not exist "vscode-extension\package.json" (
  echo vscode-extension\package.json was not found.
  pause
  exit /b 1
)

pushd "vscode-extension"

if not exist "node_modules" (
  echo Installing VS Code extension dependencies...
  call npm install
  if errorlevel 1 goto :fail
)

echo Building VS Code extension...
call npm run build
if errorlevel 1 goto :fail

echo Packaging VSIX...
call npm run package:vsix
if errorlevel 1 goto :fail

echo.
echo Package build complete.
dir /b *.vsix
popd
pause
exit /b 0

:fail
echo.
echo Package build failed.
popd
pause
exit /b 1
