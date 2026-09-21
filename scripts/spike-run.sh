#!/usr/bin/env bash
# P0-T05 Spike A — owner run on real Fedora hardware (authoritative numbers).
#
# Installs the Tauri Linux deps, then runs the LWC v5 spike in autorun mode
# and prints the report path. Paste the JSON into docs/spikes/lwc-webkitgtk.md.
#
# Usage: bash scripts/spike-run.sh [duration_seconds]
set -euo pipefail
DURATION="${1:-20}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if command -v dnf >/dev/null 2>&1; then
  echo "==> installing Tauri Linux deps (sudo)"
  sudo dnf install -y webkit2gtk4.1-devel gtk3-devel librsvg2-devel
fi

command -v pnpm >/dev/null 2>&1 || { echo "pnpm is required (npm i -g pnpm)"; exit 1; }

cd "$ROOT/spikes/lwc-webkitgtk/web"
[ -d node_modules ] || pnpm install

export SPIKE_AUTORUN=1
export SPIKE_DURATION="$DURATION"
export SPIKE_REPORT_PATH="$ROOT/docs/spikes/spike-report.json"

echo "==> running spike (${DURATION}s active measurement) — the window closes when done"
pnpm tauri dev

echo "==> report: $SPIKE_REPORT_PATH"
cat "$SPIKE_REPORT_PATH"
