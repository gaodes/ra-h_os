# RA-H MCP Connector Setup

The desktop app now ships with a local Model Context Protocol (MCP) server so any MCP‑compatible assistant (Claude, ChatGPT, Gemini, Codex, etc.) can read/write your RA-H graph. Everything runs on `127.0.0.1` and never leaves your Mac.

## Quick Start

1. Launch the RA-H desktop app (it boots the Next.js sidecar + MCP bridge automatically).
2. Open **Settings → External Agents** inside RA-H and copy the connector URL (example: `http://127.0.0.1:44145/mcp`).
3. In Claude, ChatGPT, or any other assistant:
   - open the MCP/connectors panel,
   - choose **Add connector → HTTP**,
   - paste the copied URL and name it “RA-H”.
4. Talk naturally. Examples:
   - “Summarize this chat and add it to RA-H under Strategy + Q1 Execution.”
   - “Search RA-H for what I already wrote about Apollo launch delays.”

The assistant calls two tools behind the scenes:

| Tool | Description |
| --- | --- |
| `rah_add_node` | Adds a new entry (title/content/dimensions) to the local SQLite graph and triggers the auto-embed queue. |
| `rah_search_nodes` | Searches existing nodes (title/content/dimensions) before deciding whether to create something new. |

## Guardrails

- The MCP server only binds to `127.0.0.1` and is meant for **your** agents. Do not expose it beyond your machine.
- Anything the assistant writes is immediately persisted to `~/Library/Application Support/RA-H/db/rah.sqlite`. Review the RA-H activity panel if something looks off.
- Disable the connector by setting `RAH_ENABLE_MCP=false` before launching the app (UI toggle coming soon).
- The `/status` endpoint returns health info if you need diagnostics: `curl http://127.0.0.1:44145/status`.

### Claude Desktop (STDIO Connector)

Claude’s configuration window expects STDIO-based servers. To let Claude start a connector directly, point it at:

```
node /Users/<you>/Desktop/dev/ra-h/apps/mcp-server/stdio-server.js
```

This script speaks MCP over stdin/stdout (no HTTP listener), so Claude can manage it through `claude_desktop_config.json` or the “Add MCP Server” CLI flow. Keep the main RA-H app running so the STDIO bridge can call `http://127.0.0.1:3000/api/nodes`.

## Development Notes

- Implementation lives in `apps/mcp-server/server.js` (HTTP transport + tool definitions). It proxies through the existing `/api/nodes/*` routes, so validation + auto-embed behavior stays consistent.
- The Mac sidecar (`apps/mac/scripts/sidecar-launcher.js`) bootstraps the MCP server and keeps `~/Library/Application Support/RA-H/config/mcp-status.json` updated for the Settings panel/API.
- To run the server standalone (for MCP Inspector, etc.): `node apps/mcp-server/server.js` (requires the Next.js sidecar to be running so the API endpoints respond).
