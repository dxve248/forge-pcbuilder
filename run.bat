@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   Node.js is required but was not found on your PATH.
    echo   Download it from https://nodejs.org/ and try again.
    echo.
    pause
    exit /b 1
)

set "PORT=5173"
echo.
echo   Starting ForgePC 3D PC Builder on port %PORT% ...
echo   Your browser will open shortly. Press Ctrl+C to stop the server.
echo.

start "" cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:%PORT%"

node server.mjs %PORT%

pause
