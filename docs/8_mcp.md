# MCP Server

> Connect Claude Code and other AI assistants to your knowledge base.

**How it works:** RA-OS includes an MCP (Model Context Protocol) server. This lets any MCP-compatible assistant — like Claude Code — search your notes, add new knowledge, and manage your knowledge graph. Everything stays local.

---

## Quick Start (Recommended)

The easiest way is using the npm package:

```json
{
  "mcpServers": {
    "ra-h": {
      "command": "npx",
      "args": ["ra-h-mcp-server"]
    }
  }
}
```

Add this to your `~/.claude.json` (Claude Code) or Claude Desktop settings.

**Requirements:**
- Node.js 18+ installed

**That's it.** The database is created automatically on first connection. No need to keep RA-OS running.

---

## Alternative: Local Development

If you're developing RA-OS and want to use the local server:

### Standalone (No Web App Required)

```json
{
  "mcpServers": {
    "ra-h": {
      "command": "node",
      "args": ["/path/to/ra-h_os/apps/mcp-server-standalone/index.js"]
    }
  }
}
```

First install dependencies:
```bash
cd apps/mcp-server-standalone
npm install
```

### HTTP Transport (Web App Required)

If you want real-time UI updates when nodes are created:

1. Start RA-OS: `npm run dev`
2. Configure:

```json
{
  "mcpServers": {
    "ra-h": {
      "url": "http://127.0.0.1:44145/mcp"
    }
  }
}
```

---

## Available Tools

| Tool | Description |
|------|-------------|
| `rah_get_context` | Get graph overview — stats, hub nodes, dimensions, recent activity. Called first automatically. |
| `rah_add_node` | Create a new node (title/content/dimensions) |
| `rah_search_nodes` | Search existing nodes by keyword |
| `rah_update_node` | Update an existing node |
| `rah_get_nodes` | Get nodes by ID |
| `rah_create_edge` | Create relationship between nodes |
| `rah_update_edge` | Update an edge explanation |
| `rah_query_edges` | Query existing edges |
| `rah_list_dimensions` | List all dimensions |
| `rah_create_dimension` | Create a new dimension |
| `rah_update_dimension` | Update/rename dimension |
| `rah_delete_dimension` | Delete a dimension |
| `rah_list_guides` | List available guides (system + custom) |
| `rah_read_guide` | Read a guide by name |
| `rah_write_guide` | Create or update a custom guide |
| `rah_delete_guide` | Delete a custom guide |

---

## What to Expect

Once connected, the MCP server instructs Claude to:

1. **Call `rah_get_context` first** to understand your graph (hub nodes, dimensions, stats)
2. **Proactively identify valuable information** in conversations and offer to save it
3. **Search before creating** to avoid duplicates
4. **Require edge explanations** — every connection needs a reason

You don't need to ask Claude to use your knowledge base — it will offer when it spots something worth saving.

---

## Example Usage

Once connected, you can ask your AI assistant:

```
"What's in my knowledge graph?"
"Search RA-H for what I wrote about product strategy"
"Add this conversation summary to RA-H as a new node"
"Find all nodes with the 'research' dimension"
"Create an edge between node 123 and node 456"
```

---

## Key Files

| File | Purpose |
|------|---------|
| `apps/mcp-server-standalone/` | **Standalone server (direct SQLite, recommended)** |
| `apps/mcp-server/server.js` | HTTP MCP server |
| `apps/mcp-server/stdio-server.js` | STDIO bridge to HTTP server |

---

## Security

- The MCP server only binds to `127.0.0.1` — localhost only
- No authentication required (local access only)
- All data persisted to `~/Library/Application Support/RA-H/db/rah.sqlite`

---

## Troubleshooting

### "Database not found"

The MCP server auto-creates the database on first connection (v1.1.0+). If you're on an older version, run RA-OS once to create it:
```bash
npm run dev
```

### "Tools not showing" (npm package)

1. Make sure Node.js 18+ is installed: `node --version`
2. Try running manually: `npx ra-h-mcp-server`
3. Restart Claude Code

### "Connection refused" (HTTP method)

1. Make sure RA-OS is running: `npm run dev`
2. Check the port: `lsof -i :44145`
