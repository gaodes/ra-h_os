#!/usr/bin/env bash
set -e

PORT=44145
SERVER="$(cd "$(dirname "$0")/../.." && pwd)/apps/mcp-server/server.js"

# Clear port before starting so restarts never hit EADDRINUSE
EXISTING=$(lsof -ti:${PORT} 2>/dev/null || true)
if [ -n "$EXISTING" ]; then
  echo "[mcp] Clearing port ${PORT} (PID: ${EXISTING})"
  kill "$EXISTING" 2>/dev/null || true
  sleep 0.5
fi

exec node "$SERVER"
