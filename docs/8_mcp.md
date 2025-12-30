# RA-H MCP Server Setup

RA-H includes a local Model Context Protocol (MCP) server that lets any MCP-compatible assistant (Claude, ChatGPT, Gemini, etc.) read/write your knowledge graph. Everything runs on `127.0.0.1` and never leaves your machine.

## Overview

The MCP server is a standalone Node.js process that bridges external AI assistants to your local RA-H database. In the open source version, you run this server manually alongside the Next.js dev server.

## Quick Start

### 1. Start the Next.js Server

```bash
npm run dev
```

This starts the web app at `http://localhost:3000`.

### 2. Start the MCP Server

In a separate terminal:

```bash
node apps/mcp-server/server.js
```

The MCP server will start on port `44145` by default.

### 3. Connect Your Assistant

1. Open **Settings → External Agents** in RA-H and copy the connector URL: `http://127.0.0.1:44145/mcp`
2. In Claude, ChatGPT, or your assistant:
   - Open the MCP/connectors panel
   - Choose **Add connector → HTTP**
   - Paste the URL and name it "RA-H"

### 4. Use It

Talk naturally:
- "Summarize this chat and add it to RA-H under Strategy + Q1 Execution."
- "Search RA-H for what I already wrote about Apollo launch delays."

## Available Tools

| Tool | Description |
|------|-------------|
| `rah_add_node` | Adds a new entry (title/content/dimensions) to the local SQLite graph and triggers auto-embedding. |
| `rah_search_nodes` | Searches existing nodes (title/content/dimensions) before deciding whether to create something new. |

## Claude Desktop (STDIO Connector)

Claude Desktop expects STDIO-based servers. Point it at:

```
node /path/to/ra-h_os/apps/mcp-server/stdio-server.js
```

This speaks MCP over stdin/stdout. Add it to `claude_desktop_config.json` or use the "Add MCP Server" CLI flow. Keep the Next.js server running so the STDIO bridge can call `http://127.0.0.1:3000/api/nodes`.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `MCP_PORT` | `44145` | Port for the HTTP MCP server |
| `RAH_ENABLE_MCP` | `true` | Set to `false` to disable MCP |

## Security Notes

- The MCP server only binds to `127.0.0.1` — it's meant for **your** local agents only
- Do not expose it beyond your machine
- Anything the assistant writes is immediately persisted to your local SQLite database
- Review the RA-H activity panel if something looks unexpected

## Troubleshooting

### Server won't start
- Ensure the Next.js dev server is running first
- Check if port 44145 is already in use: `lsof -i :44145`

### Connection fails in assistant
- Verify both servers are running (Next.js on 3000, MCP on 44145)
- Try the health endpoint: `curl http://127.0.0.1:44145/status`

### Tools not working
- The MCP server proxies through `/api/nodes/*` routes — ensure the Next.js server responds
- Check the terminal running the MCP server for error logs

## Development

- Implementation: `apps/mcp-server/server.js` (HTTP transport + tool definitions)
- STDIO variant: `apps/mcp-server/stdio-server.js`
- The server proxies through existing `/api/nodes/*` routes, so validation and auto-embed behavior stays consistent
