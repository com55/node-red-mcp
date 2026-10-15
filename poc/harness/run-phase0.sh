#!/usr/bin/env bash
# Start Node-RED harness, run smoke tests, restart to verify routes survive process recycle.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PORT="${PORT:-1880}"
export PORT
# Always pin roots for the default smoke path unless the caller overrides them.
# (A leftover HTTP_ADMIN_ROOT=/admin from a prefix experiment would otherwise
# move /auth/token and /mcp under that prefix and break the harness.)
export HTTP_ADMIN_ROOT="${HTTP_ADMIN_ROOT:-/}"
export HTTP_NODE_ROOT="${HTTP_NODE_ROOT:-/}"
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://127.0.0.1:${PORT}}"
export NODERED_URL="${NODERED_URL:-http://127.0.0.1:${PORT}}"
export POC_ADMIN_USERNAME="${POC_ADMIN_USERNAME:-poc-admin}"
export POC_ADMIN_PASSWORD="${POC_ADMIN_PASSWORD:-poc-admin-pass}"

LOG_FILE="${ROOT}/.nodered-poc.log"
PID_FILE="${ROOT}/.nodered-poc.pid"
NODE_RED_BIN="${ROOT}/node_modules/.bin/node-red"

cleanup() {
  if [[ -f "$PID_FILE" ]]; then
    pid="$(cat "$PID_FILE" || true)"
    if [[ -n "${pid}" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      for _ in 1 2 3 4 5 6 7 8 9 10; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.2
      done
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
    fi
    rm -f "$PID_FILE"
  fi
  # Belt-and-suspenders: free the harness port if a stray process remains.
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
  fi
  pkill -f "${NODE_RED_BIN} .*${ROOT}" >/dev/null 2>&1 || true
  # Wait until the port is no longer accepting connections.
  for _ in $(seq 1 30); do
    if ! curl -fsS -o /dev/null --connect-timeout 1 "${NODERED_URL}/auth/login" 2>/dev/null; then
      return 0
    fi
    sleep 0.2
  done
}
trap cleanup EXIT

wait_ready() {
  local tries=60
  for ((i=1; i<=tries; i++)); do
    if curl -fsS "${NODERED_URL}/auth/login" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  echo "Node-RED did not become ready in time. Log tail:" >&2
  tail -n 80 "$LOG_FILE" >&2 || true
  return 1
}

start_nodered() {
  : > "$LOG_FILE"
  mkdir -p "$ROOT/lib"
  # Use an explicit flows file name so hostname-based defaults do not surprise us.
  export NODE_RED_ENABLE_SAFE_MODE=
  echo '[]' > "$ROOT/flows.json"
  echo '{}' > "$ROOT/flows_cred.json"

  if [[ ! -x "$NODE_RED_BIN" ]]; then
    echo "Missing ${NODE_RED_BIN}; run npm install first" >&2
    exit 1
  fi

  # Start the binary directly (not via npx) so PID_FILE tracks the real server.
  "$NODE_RED_BIN" -u "$ROOT" -s "$ROOT/settings.js" >>"$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  wait_ready
  echo "Node-RED ready on ${NODERED_URL} (pid $(cat "$PID_FILE"))"
}

fetch_registration_stamp() {
  local token
  token="$(curl -fsS -X POST "${NODERED_URL}/auth/token" \
    -H 'Content-Type: application/json' \
    -d "{\"client_id\":\"node-red-admin\",\"grant_type\":\"password\",\"scope\":\"*\",\"username\":\"${POC_ADMIN_USERNAME}\",\"password\":\"${POC_ADMIN_PASSWORD}\"}" \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).access_token))")"
  curl -fsS "${NODERED_URL}/mcp/poc/registration" -H "Authorization: Bearer ${token}"
}

echo "==> Installing harness dependencies"
npm install --no-fund --no-audit

echo "==> Starting Node-RED (first boot)"
start_nodered
FIRST_REG="$(fetch_registration_stamp)"
echo "First boot registration: ${FIRST_REG}"
echo "${FIRST_REG}" > "$ROOT/registration-first.json"

echo "==> Running smoke tests (first boot)"
node ./smoke-test.mjs | tee "$ROOT/smoke-first.log"
FIRST_STATUS=${PIPESTATUS[0]}

echo "==> Restarting Node-RED to verify routes survive process restart"
cleanup
trap cleanup EXIT
start_nodered
SECOND_REG="$(fetch_registration_stamp)"
echo "After restart registration: ${SECOND_REG}"
echo "${SECOND_REG}" > "$ROOT/registration-restart.json"

FIRST_TS="$(node -e "const fs=require('fs');const a=JSON.parse(fs.readFileSync('registration-first.json','utf8'));process.stdout.write(a.registrationState.ownerRegisteredAt)")"
SECOND_TS="$(node -e "const fs=require('fs');const a=JSON.parse(fs.readFileSync('registration-restart.json','utf8'));process.stdout.write(a.registrationState.ownerRegisteredAt)")"
if [[ "$FIRST_TS" == "$SECOND_TS" ]]; then
  echo "FAIL: registration timestamp unchanged after restart (likely old process still bound)" >&2
  exit 1
fi
echo "PASS: registration timestamp changed after restart (${FIRST_TS} -> ${SECOND_TS})"

echo "==> Running smoke tests (after restart)"
node ./smoke-test.mjs | tee "$ROOT/smoke-restart.log"
SECOND_STATUS=${PIPESTATUS[0]}

echo "==> Done"
if [[ "$FIRST_STATUS" -ne 0 || "$SECOND_STATUS" -ne 0 ]]; then
  echo "Smoke tests failed (first=${FIRST_STATUS} restart=${SECOND_STATUS})" >&2
  exit 1
fi

echo "All Phase 0 smoke checks passed."
