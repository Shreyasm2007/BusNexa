@echo off
setlocal
cd /d "%~dp0"
set "ROOT=%~dp0"
echo ========================================
echo          NIGHTROUTE STARTUP
echo ========================================
if not exist "server\node_modules" (
  echo Installing backend dependencies...
  call npm install --prefix server
  if errorlevel 1 goto failed
)
if not exist "client\node_modules" (
  echo Installing frontend dependencies...
  call npm install --prefix client
  if errorlevel 1 goto failed
)
start "NightRoute API - keep this window open" cmd /k "cd /d ""%ROOT%server"" && npm start"
start "NightRoute Web - keep this window open" cmd /k "cd /d ""%ROOT%client"" && npm run dev -- --host 127.0.0.1"
echo.
echo Backend: http://localhost:5000/api/health
echo Frontend: http://localhost:5173
echo Keep both opened terminal windows running. Your PC must stay awake.
exit /b 0
:failed
echo Dependency installation failed. Check internet access and Node.js/npm.
pause
exit /b 1
