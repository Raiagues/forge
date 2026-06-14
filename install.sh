#!/usr/bin/env bash
# GuiaSat — install & environment check
# Installs dependencies and validates that the local toolchain can run Vite 5.
set -euo pipefail

cd "$(dirname "$0")"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$1"; }

bold "GuiaSat · install"

# ── Node.js ────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  err "Node.js not found. Install Node 20.x (https://nodejs.org) and re-run."
  exit 1
fi
NODE_RAW="$(node -v)"           # e.g. v20.18.0
NODE_MAJOR="$(echo "$NODE_RAW" | sed 's/v\([0-9]*\).*/\1/')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  err "Node $NODE_RAW is too old. GuiaSat needs Node 18+ (20.x recommended)."
  exit 1
fi
ok "Node $NODE_RAW"

# ── npm ────────────────────────────────────────────────────────────
if ! command -v npm >/dev/null 2>&1; then
  err "npm not found (it ships with Node). Re-install Node.js."
  exit 1
fi
ok "npm $(npm -v)"

# ── dependencies ───────────────────────────────────────────────────
bold "Installing dependencies (npm install)…"
npm install

# ── sanity build check ─────────────────────────────────────────────
bold "Verifying the project builds…"
if npm run build >/tmp/forge-install-build.log 2>&1; then
  ok "production build succeeds"
else
  err "build failed — see /tmp/forge-install-build.log"
  tail -n 20 /tmp/forge-install-build.log
  exit 1
fi

bold "Done."
echo "Next:  ./start.sh    (launches the dev server and opens the browser)"
