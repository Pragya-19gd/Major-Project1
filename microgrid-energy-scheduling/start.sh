#!/usr/bin/env bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "=================================================================="
echo "    MICROGRID ENERGY SCHEDULING & REAL-TIME TELEMETRY SYSTEM      "
echo "=================================================================="

# Check if docker is available and user wants docker mode
if [ "$1" == "--docker" ] || [ "$1" == "-d" ]; then
    if command -v docker &> /dev/null && command -v docker compose &> /dev/null; then
        echo "[*] Starting services via Docker Compose..."
        docker compose up --build
        exit 0
    else
        echo "[!] Docker not detected or docker compose unavailable. Falling back to local execution."
    fi
fi

# 1. Setup Backend Python Environment
echo "[1/3] Configuring Python backend environment..."
cd "$PROJECT_ROOT/backend"

if [ ! -d ".venv" ]; then
    echo "Creating virtual environment in backend/.venv..."
    python3 -m venv .venv || python -m venv .venv
fi

# Activate virtual environment
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
elif [ -f ".venv/Scripts/activate" ]; then
    source .venv/Scripts/activate
fi

echo "Installing Python backend requirements..."
pip install --upgrade pip
pip install -r requirements.txt

# 2. Setup Frontend Environment
echo "[2/3] Configuring React TypeScript frontend environment..."
cd "$PROJECT_ROOT/frontend"

if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies via npm..."
    npm install
fi

# 3. Launch Services
echo "[3/3] Launching Microgrid System Services..."

cleanup() {
    echo ""
    echo "Shutting down Microgrid services..."
    kill $(jobs -p) 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Start Backend
cd "$PROJECT_ROOT/backend"
echo "Starting FastAPI Telemetry Server on http://localhost:8000..."
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Start Frontend
cd "$PROJECT_ROOT/frontend"
echo "Starting Vite Frontend Dashboard on http://localhost:5173..."
npm run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!

echo ""
echo "=================================================================="
echo "  Microgrid Telemetry API:  http://localhost:8000"
echo "  Interactive API Docs:     http://localhost:8000/docs"
echo "  SCADA Dashboard UI:       http://localhost:5173"
echo "=================================================================="
echo "Press Ctrl+C to terminate all services."

wait
