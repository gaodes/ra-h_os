#!/usr/bin/env bash
# Start the RA-H MCP server in the background if not already running.
# The process is detached (survives npm run dev being killed).

PORT=44145
LOG="$HOME/Library/Application Support/RA-H/mcp-server.log"
SERVER="$(cd "$(dirname "$0")/../.." && pwd)/apps/mcp-server/server.js"

if lsof -iTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
  echo "[mcp] Already running on port ${PORT}"
  exit 0
fi

mkdir -p "$(dirname "$LOG")"
nohup node "$SERVER" > "$LOG" 2>&1 &
disown

echo "[mcp] Started (PID $!, logs: $LOG)"
