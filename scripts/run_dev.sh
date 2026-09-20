#!/usr/bin/env bash
# Run both backend (FastAPI) and frontend (Vite) in dev mode.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Start backend
cd "$ROOT/backend"
if [ ! -d .venv ]; then
    echo "Creating backend venv..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
else
    source .venv/bin/activate
fi

if [ ! -f .env ]; then
    cp .env.example .env
fi

echo "==> Starting backend on http://127.0.0.1:8000"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 &
BE_PID=$!

# Start frontend
cd "$ROOT/frontend"
if [ ! -d node_modules ]; then
    pnpm install
fi

echo "==> Starting frontend on http://127.0.0.1:5173"
pnpm dev --host 127.0.0.1 --port 5173 &
FE_PID=$!

cleanup() {
    echo "Stopping..."
    kill $BE_PID $FE_PID 2>/dev/null || true
}
trap cleanup INT TERM
wait
