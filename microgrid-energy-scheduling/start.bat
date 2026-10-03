@echo off
setlocal enabledelayedexpansion

echo ==================================================================
echo     MICROGRID ENERGY SCHEDULING ^& REAL-TIME TELEMETRY SYSTEM      
echo ==================================================================

set ROOT_DIR=%~dp0
cd /d "%ROOT_DIR%"

echo [1/3] Setting up Python backend...
cd /d "%ROOT_DIR%backend"
if not exist ".venv" (
    echo Creating virtual environment in backend/.venv...
    python -m venv .venv
)

call .venv\Scripts\activate.bat
pip install -r requirements.txt

echo [2/3] Setting up Frontend dependencies...
cd /d "%ROOT_DIR%frontend"
if not exist "node_modules" (
    echo Installing node dependencies...
    call npm install
)

echo [3/3] Launching Microgrid Services...
start "Microgrid Backend (FastAPI)" cmd /k "cd /d %ROOT_DIR%backend && call .venv\Scripts\activate.bat && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
start "Microgrid Frontend (Vite)" cmd /k "cd /d %ROOT_DIR%frontend && npm run dev -- --host 0.0.0.0"

echo.
echo ==================================================================
echo   Microgrid Telemetry API:  http://localhost:8000
echo   Interactive API Docs:     http://localhost:8000/docs
echo   SCADA Dashboard UI:       http://localhost:5173
echo ==================================================================
pause
