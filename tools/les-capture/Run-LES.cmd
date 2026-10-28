@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 22 or newer from https://nodejs.org then run this file again.
  pause
  exit /b 1
)
if not exist node_modules\playwright (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm run capture
pause
