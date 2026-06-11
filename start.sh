#!/usr/bin/env bash
# FORGE — start the flash server + Vite dev server (both backgrounded) and
# open the browser. One command, no extra terminals. ./stop.sh stops both.
set -euo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-5173}"
SERVER_PORT="${SERVER_PORT:-3001}"
URL="http://localhost:${PORT}/"
PIDFILE=".forge-dev.pid"
LOG=".forge-dev.log"
SRV_PIDFILE=".forge-server.pid"
SRV_LOG=".forge-server.log"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }

# ── already running? verify it is actually HEALTHY ─────────────────
# A live pid is not enough: a stale Vite dep-optimizer cache makes the
# server answer 200 while the browser gets "Outdated Optimize Dep"
# errors. If anything looks wrong, stop everything and start fresh.
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  healthy=1
  curl -sf -o /dev/null "$URL" || healthy=0
  if [ -f "$LOG" ] && tail -n 50 "$LOG" | grep -q "does not exist at"; then
    healthy=0   # stale node_modules/.vite dep cache
  fi
  if [ "$healthy" -eq 1 ]; then
    bold "FORGE already running (pid $(cat "$PIDFILE"))."
    echo "  $URL"
    echo "  ./stop.sh to stop it."
    exit 0
  fi
  bold "FORGE process exists but is unhealthy — restarting cleanly…"
  ./stop.sh >/dev/null 2>&1 || true
fi

# ── orphan processes holding our ports (lost pidfile)? clean them ──
if curl -sf -o /dev/null "$URL" 2>/dev/null; then
  bold "Port ${PORT} is busy with an untracked process — cleaning up…"
  ./stop.sh >/dev/null 2>&1 || true
fi

# ── clear the Vite dep-optimizer cache (prevents stale-chunk errors) ─
rm -rf node_modules/.vite

# ── ensure deps are present ────────────────────────────────────────
if [ ! -d node_modules ]; then
  bold "Dependencies missing — running ./install.sh first…"
  ./install.sh
fi

# ── start the flash server (backend) ───────────────────────────────
if [ -f "$SRV_PIDFILE" ] && kill -0 "$(cat "$SRV_PIDFILE")" 2>/dev/null; then
  bold "Flash server already running (pid $(cat "$SRV_PIDFILE"))."
else
  bold "Starting flash server on port ${SERVER_PORT}…"
  if command -v setsid >/dev/null 2>&1; then
    setsid npm run server >"$SRV_LOG" 2>&1 &
  else
    npm run server >"$SRV_LOG" 2>&1 &
  fi
  echo $! > "$SRV_PIDFILE"
fi

# ── start the Vite dev server (frontend) ───────────────────────────
bold "Starting FORGE dev server on port ${PORT}…"
if command -v setsid >/dev/null 2>&1; then
  setsid npm run dev -- --port "$PORT" >"$LOG" 2>&1 &
else
  npm run dev -- --port "$PORT" >"$LOG" 2>&1 &
fi
echo $! > "$PIDFILE"

# ── wait until the frontend actually answers ───────────────────────
printf 'Waiting for server'
for _ in $(seq 1 40); do
  if curl -s -o /dev/null "http://localhost:${PORT}/"; then
    printf '\n'
    bold "FORGE is running:"
    echo "  ➜  ${URL}"
    echo "  flash server: http://localhost:${SERVER_PORT}/  (POST /flash)"
    # best-effort browser open (never fatal) — exactly ONE window:
    # if/elif so success of one opener never chains into the next
    (
      if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
      elif command -v open >/dev/null 2>&1; then open "$URL"
      elif command -v google-chrome >/dev/null 2>&1; then google-chrome "$URL"
      fi
    ) >/dev/null 2>&1 &
    echo "  logs:  tail -f ${LOG}  ·  tail -f ${SRV_LOG}"
    echo "  stop:  ./stop.sh"
    exit 0
  fi
  printf '.'
  sleep 0.5
done

printf '\n'
bold "Server did not respond in time. Last log lines:"
tail -n 25 "$LOG"
exit 1
