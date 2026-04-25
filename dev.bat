@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18+ is required to run Markdown Pattern Studio.
  echo Download: https://nodejs.org/
  pause
  exit /b 1
)

npm start
if errorlevel 1 (
  echo.
  echo Failed to start Markdown Pattern Studio.
  pause
  exit /b 1
)
