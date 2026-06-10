#!/usr/bin/env bash
# FORGE — user-testing launcher.
#
# One command for testing sessions with real users:
#   ./start_test_user.sh
#
# It starts the backend (analytics persistence + flash/serial server) and
# the frontend in USER-TEST MODE (developer tools hidden from the rail),
# opens the browser, and prints facilitator instructions. Every event lands
# in analytics/sessions/<session_id>.jsonl — copy the folder after the day.
#
# Facilitator guide: user_testing_env/README.md
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

# ── analytics storage ──────────────────────────────────────────────
mkdir -p analytics/sessions

# ── already running? restart clean so test mode flags apply ────────
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  bold "FORGE already running — restarting in user-test mode…"
  ./stop.sh >/dev/null 2>&1 || true
  sleep 1
fi

# ── ensure deps are present ────────────────────────────────────────
if [ ! -d node_modules ]; then
  bold "Dependencies missing — running ./install.sh first…"
  ./install.sh
fi

# ── backend: analytics + flash/serial server ───────────────────────
if [ -f "$SRV_PIDFILE" ] && kill -0 "$(cat "$SRV_PIDFILE")" 2>/dev/null; then
  bold "Backend already running (pid $(cat "$SRV_PIDFILE"))."
else
  bold "Starting backend (analytics + serial) on port ${SERVER_PORT}…"
  if command -v setsid >/dev/null 2>&1; then
    setsid npm run server >"$SRV_LOG" 2>&1 &
  else
    npm run server >"$SRV_LOG" 2>&1 &
  fi
  echo $! > "$SRV_PIDFILE"
fi

# ── frontend in USER-TEST MODE ─────────────────────────────────────
bold "Starting FORGE in user-test mode on port ${PORT}…"
if command -v setsid >/dev/null 2>&1; then
  VITE_USER_TEST=1 setsid npm run dev -- --port "$PORT" >"$LOG" 2>&1 &
else
  VITE_USER_TEST=1 npm run dev -- --port "$PORT" >"$LOG" 2>&1 &
fi
echo $! > "$PIDFILE"

# ── wait until the frontend answers ────────────────────────────────
printf 'Waiting for server'
for _ in $(seq 1 40); do
  if curl -s -o /dev/null "http://localhost:${PORT}/"; then
    printf '\n\n'
    bold "════════════════════════════════════════════════════════"
    bold " FORGE · MODO DE TESTE COM USUÁRIOS"
    bold "════════════════════════════════════════════════════════"
    echo ""
    echo "  URL:                ${URL}"
    echo "  Dados da sessão:    analytics/sessions/  (1 arquivo por sessão)"
    echo ""
    bold " Para o facilitador:"
    echo "  1. Cada aba/recarga do navegador = um session_id novo (automático)."
    echo "  2. Entre um usuário e outro: ícone de engrenagem (canto inferior"
    echo "     esquerdo) > 'nova sessão de teste'. Isso grava os eventos"
    echo "     pendentes e zera o estado do app."
    echo "  3. Roteiro da sessão e métricas: user_testing_env/README.md"
    echo "  4. Exportar tudo ao final:  node user_testing_env/aggregate.js"
    echo "     (ou GET http://localhost:${SERVER_PORT}/analytics/export)"
    echo ""
    echo "  Parar tudo:  ./stop.sh"
    echo ""
    # best-effort browser open (never fatal)
    ( command -v xdg-open >/dev/null 2>&1 && xdg-open "$URL" \
      || command -v open >/dev/null 2>&1 && open "$URL" \
      || command -v google-chrome >/dev/null 2>&1 && google-chrome "$URL" ) >/dev/null 2>&1 &
    exit 0
  fi
  printf '.'
  sleep 0.5
done

printf '\n'
bold "Server did not respond in time. Last log lines:"
tail -n 25 "$LOG"
exit 1
