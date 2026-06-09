@echo off
REM ====================================================================
REM  TijusPro LMS - local dev launcher
REM  Installs deps if needed, ensures a .env exists, then starts both
REM  the backend (port 8000) and the Vite frontend (port 5173).
REM ====================================================================
setlocal
cd /d "%~dp0"

echo === TijusPro LMS - local dev ===

REM --- root dependencies -------------------------------------------------
if not exist "node_modules" (
  echo Installing root dependencies...
  call npm install
  if errorlevel 1 goto :fail
)

REM --- frontend dependencies -------------------------------------------
if not exist "frontend\node_modules" (
  echo Installing frontend dependencies...
  pushd frontend
  call npm install
  if errorlevel 1 ( popd & goto :fail )
  popd
)

REM --- environment file -------------------------------------------------
if not exist ".env" (
  if exist ".env.example" (
    echo No .env found - creating one from .env.example
    copy /Y ".env.example" ".env" >nul
    echo.
    echo  *** WARNING: fill in .env with your MySQL/LiveKit credentials. ***
    echo  *** The backend will not start without a working DB connection. ***
    echo.
  ) else (
    echo  *** WARNING: no .env or .env.example found - backend may fail to start. ***
  )
)

REM --- launch backend + frontend --------------------------------------
echo.
echo Starting servers...
echo   Backend : http://localhost:8000
echo   Frontend: http://localhost:5173
echo.
call npm run dev

echo.
echo Servers stopped.
pause
goto :eof

:fail
echo.
echo Dependency installation failed. See the errors above.
pause
