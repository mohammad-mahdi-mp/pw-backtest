#!/usr/bin/env bash
# §1.7 manifest contract guard (EXECUTION_PLAN.md).
#
# The frozen dependency manifests may only change in a push whose commit
# range contains at least one `contract:` commit. Anything else fails the
# build — dependency growth is a contract decision, never a side effect.
#
# Usage: check-manifest-contract.sh <before-sha> <after-sha>
set -euo pipefail

BEFORE="${1:-}"
AFTER="${2:-}"

if [ -z "$BEFORE" ] || [ -z "$AFTER" ] \
  || ! git rev-parse -q --verify "$BEFORE" >/dev/null 2>&1 \
  || ! git rev-parse -q --verify "$AFTER" >/dev/null 2>&1; then
  echo "manifest-check: no valid commit range — skipping (first push of the branch)"
  exit 0
fi

MANIFESTS='^(core/Cargo\.toml|app/src-tauri/Cargo\.toml|ui/package\.json|ui/pnpm-lock\.yaml)$'
CHANGED="$(git diff --name-only "$BEFORE" "$AFTER" | grep -E "$MANIFESTS" || true)"

if [ -z "$CHANGED" ]; then
  echo "manifest-check: manifests untouched — OK"
  exit 0
fi

echo "manifest-check: changed frozen manifests:"
echo "$CHANGED"

CONTRACTS="$(git log --format=%s "$BEFORE..$AFTER" | grep -Eci 'contract[(:]' || true)"
if [ "$CONTRACTS" -eq 0 ]; then
  echo "FAIL: frozen manifest(s) changed without a 'contract:' commit in this push"
  echo "(EXECUTION_PLAN.md §1.7 — dependency growth is a contract task)"
  exit 1
fi

echo "manifest-check: 'contract:' commit present in range — OK"
