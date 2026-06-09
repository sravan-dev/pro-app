@echo off
REM ====================================================================
REM  TijusPro LMS - stop local dev servers
REM  Frees the backend (8000) and frontend (5173) ports by killing
REM  whatever process is listening on them.
REM ====================================================================
setlocal enabledelayedexpansion

echo Stopping TijusPro LMS dev servers...

for %%P in (8000 5173) do (
  set "found="
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr ":%%P" ^| findstr LISTENING') do (
    set "found=1"
    echo   Port %%P : killing PID %%I
    taskkill /F /PID %%I >nul 2>&1
  )
  if not defined found echo   Port %%P : already free
)

echo Done.
