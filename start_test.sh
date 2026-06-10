#!/usr/bin/env bash
# FORGE — safe parallel test instance.
#
# Snapshots the current git state to /tmp/forge_test_snapshot and runs it
# there on its own ports (frontend 5180, flash server 3002), so the
# original running instance (5173/3001) is never touched.
#
#   ./start_test.sh          start (or restart) the test instance
#   ./start_test.sh stop     stop it
set -euo pipefail

cd "$(dirname "$0")"

SNAPSHOT="/tmp/forge_test_snapshot"
TEST_PORT="${TEST_PORT:-5180}"
TEST_SERVER_PORT="${TEST_SERVER_PORT:-3002}"
URL="http://localhost:${TEST_PORT}"
PIDFILE="${SNAPSHOT}/.forge-test.pids"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }

stop_test() {
  if [ -f "$PIDFILE" ]; then
    while read -r pid; do
      # each entry is a process-group leader (setsid): kill the whole group
      kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    done < "$PIDFILE"
    rm -f "$PIDFILE"
    bold "Test instance stopped."
  else
    bold "No test instance running."
  fi
}

if [ "${1:-}" = "stop" ]; then stop_test; exit 0; fi

# ── 1 · snapshot the current git state ──────────────────────────────
[ -f "$PIDFILE" ] && stop_test
bold "Snapshotting git state to ${SNAPSHOT}…"
rm -rf "$SNAPSHOT"
mkdir -p "$SNAPSHOT"
git archive HEAD | tar -x -C "$SNAPSHOT"

# reuse the original node_modules (same lockfile) to avoid a long install
if [ -d node_modules ]; then
  ln -s "$(pwd)/node_modules" "$SNAPSHOT/node_modules"
else
  (cd "$SNAPSHOT" && npm install)
fi

# ── 2 · run from the copy on test ports ─────────────────────────────
cd "$SNAPSHOT"
bold "Starting test flash server on port ${TEST_SERVER_PORT}…"
setsid env PORT="$TEST_SERVER_PORT" node server/flash.js > .forge-test-server.log 2>&1 &
echo $! > "$PIDFILE"

bold "Starting test frontend on port ${TEST_PORT}…"
setsid env VITE_FLASH_SERVER="http://localhost:${TEST_SERVER_PORT}" \
  npx vite --port "$TEST_PORT" --strictPort > .forge-test-dev.log 2>&1 &
echo $! >> "$PIDFILE"

# ── 3 · wait until it answers ───────────────────────────────────────
printf 'Waiting for test instance'
for _ in $(seq 1 40); do
  if curl -s -o /dev/null "${URL}/"; then
    printf '\n'
    bold "FORGE test instance running at ${URL}"
    echo "  flash server: http://localhost:${TEST_SERVER_PORT}/"
    echo "  logs: tail -f ${SNAPSHOT}/.forge-test-dev.log ${SNAPSHOT}/.forge-test-server.log"
    echo "  stop: ./start_test.sh stop"
    exit 0
  fi
  printf '.'
  sleep 0.5
done

printf '\n'
bold "Test instance did not respond in time. Last log lines:"
tail -n 25 .forge-test-dev.log
exit 1
