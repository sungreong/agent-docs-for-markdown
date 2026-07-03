@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18+ is required to run the Agent Docs Local Web Editor.
  echo Download: https://nodejs.org/
  pause
  exit /b 1
)

npm start
if errorlevel 1 (
  echo.
  echo Failed to start the Agent Docs Local Web Editor.
  pause
  exit /b 1
)
