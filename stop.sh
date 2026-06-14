#!/usr/bin/env bash
# GuiaSat — stop the dev server + flash server started by ./start.sh
set -uo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-5173}"
SERVER_PORT="${SERVER_PORT:-3001}"
PIDFILE=".forge-dev.pid"
SRV_PIDFILE=".forge-server.pid"
bold() { printf '\033[1m%s\033[0m\n' "$1"; }

stopped=0

# kill a recorded pid (whole process group first — npm spawns children)
kill_pidfile() { # pidfile label
  local pidfile="$1" label="$2"
  if [ -f "$pidfile" ]; then
    local pid; pid="$(cat "$pidfile")"
    if kill -0 "$pid" 2>/dev/null; then
      kill -- "-${pid}" 2>/dev/null || kill "$pid" 2>/dev/null || true
      pkill -P "$pid" 2>/dev/null || true
      stopped=1
      bold "Stopped ${label} (pid $pid)."
    fi
    rm -f "$pidfile"
  fi
}

# free a tcp port no matter what holds it
free_port() { # port
  local port="$1"
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" >/dev/null 2>&1 && stopped=1 || true
  elif command -v lsof >/dev/null 2>&1; then
    local pids; pids="$(lsof -ti tcp:"${port}" 2>/dev/null || true)"
    if [ -n "$pids" ]; then kill $pids 2>/dev/null && stopped=1 || true; fi
  fi
}

kill_pidfile "$PIDFILE" "GuiaSat dev server"
kill_pidfile "$SRV_PIDFILE" "flash server"
free_port "$PORT"
free_port "$SERVER_PORT"

if [ "$stopped" -eq 0 ]; then
  bold "Nothing to stop — GuiaSat was not running."
else
  echo "  ports ${PORT} and ${SERVER_PORT} are free."
fi
