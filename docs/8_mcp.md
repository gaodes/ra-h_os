# RA-H MCP Server

> How to connect Claude Code and other AI assistants to your knowledge base.

**How it works:** The RA-H desktop app runs a local MCP (Model Context Protocol) server. This lets any MCP-compatible assistant — like Claude Code — search your notes, add new knowledge, and extract content from URLs. Everything stays on your Mac; nothing goes to the cloud.

---

## Quick Start

1. Launch the RA-H desktop app (it boots the MCP server automatically)
2. Open **Settings → External Agents** inside RA-H and copy the connector URL
3. Configure your assistant (see below)
4. Talk naturally: "Summarize this and add it to RA-H"

## Available Tools

| Tool | Description |
|------|-------------|
| `rah_add_node` | Create a new node (title/content/dimensions) |
| `rah_search_nodes` | Search existing nodes before creating duplicates |
| `rah_youtube_extract` | Extract transcript from YouTube video |
| `rah_website_extract` | Extract content from web page |
| `rah_paper_extract` | Extract text from PDF |

## Claude Code Configuration

Add to your `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ra-h": {
      "command": "node",
      "args": ["/Users/<you>/Desktop/dev/ra-h/apps/mcp-server/stdio-server.js"]
    }
  }
}
```

Or use the HTTP transport if you prefer:

```json
{
  "mcpServers": {
    "ra-h": {
      "url": "http://127.0.0.1:44145/mcp"
    }
  }
}
```

**Note:** The RA-H desktop app must be running for the MCP server to work.

## Claude Desktop (STDIO)

Claude Desktop expects STDIO-based servers. Point it at:

```
node /Users/<you>/Desktop/dev/ra-h/apps/mcp-server/stdio-server.js
```

This script speaks MCP over stdin/stdout. Keep the main RA-H app running so the STDIO bridge can call `http://127.0.0.1:3000/api/nodes`.

## HTTP Transport

For assistants that support HTTP transport:

1. Copy the URL from **Settings → External Agents** (e.g., `http://127.0.0.1:44145/mcp`)
2. Add as HTTP connector in your assistant

## Example Usage

Once connected, you can:

```
"Search RA-H for what I wrote about product strategy"
"Add this conversation summary to RA-H as a new node"
"Extract the transcript from this YouTube video and save to RA-H"
"Find connections between my notes on AI agents"
```

## Guardrails

- The MCP server only binds to `127.0.0.1` — for your agents only
- Everything is persisted to `~/Library/Application Support/RA-H/db/rah.sqlite`
- Disable with `RAH_ENABLE_MCP=false` before launching (UI toggle coming)
- Health check: `curl http://127.0.0.1:44145/status`

## Development

- **HTTP server:** `apps/mcp-server/server.js`
- **STDIO bridge:** `apps/mcp-server/stdio-server.js`
- **Sidecar launcher:** `apps/mac/scripts/sidecar-launcher.js`
- **Status file:** `~/Library/Application Support/RA-H/config/mcp-status.json`

To run standalone (for MCP Inspector):
```bash
node apps/mcp-server/server.js
```
Requires the Next.js sidecar to be running.
