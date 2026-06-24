@echo off
setlocal
cd /d "%~dp0"
title QMS Quality Analytics

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-web.ps1"

if errorlevel 1 (
  echo.
  echo Failed to start QMS Quality Analytics.
  pause
)
