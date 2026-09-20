#!/usr/bin/env bash
# Setup pw-backtest development environment on Fedora 44 Workstation.
set -euo pipefail

if ! grep -q "Fedora" /etc/fedora-release 2>/dev/null; then
  echo "Note: this script targets Fedora, but running anyway."
fi

echo "==> Installing system packages..."
sudo dnf install -y \
    python3 python3-pip python3-virtualenv python3-devel \
    nodejs npm \
    ta-lib ta-lib-devel \
    gcc gcc-c++ cmake make \
    rust cargo \
    sqlite3 \
    git \
    curl wget

echo "==> Installing pnpm globally..."
sudo npm install -g pnpm 2>/dev/null || npm install -g pnpm

# Backend venv
echo "==> Setting up Python virtualenv..."
cd "$(dirname "$0")/../backend"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created backend/.env — edit to add your broker API keys."
fi

# Frontend deps
echo "==> Installing frontend dependencies..."
cd "$(dirname "$0")/../frontend"
pnpm install

echo ""
echo "✅ Setup complete."
echo "Run ./scripts/run_dev.sh to start backend + frontend."
