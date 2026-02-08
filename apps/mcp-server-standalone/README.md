# RA-H MCP Server

Connect Claude Code and Claude Desktop to your RA-H knowledge base. Direct SQLite access - works without the RA-H app running.

## Install

```bash
npx ra-h-mcp-server
```

That's it. No manual setup required.

## Configure Claude Code / Claude Desktop

Add to your Claude config (`~/.claude.json` or Claude Desktop settings):

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

Restart Claude. Done.

## Requirements

- Node.js 18+
- Database is created automatically at `~/Library/Application Support/RA-H/db/rah.sqlite` on first connection

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RAH_DB_PATH` | ~/Library/Application Support/RA-H/db/rah.sqlite | Database path |

## What to Expect

Once connected, Claude will:
- **Call `rah_get_context` first** to see what's in your graph
- **Proactively offer to save** valuable information from your conversations
- **Search before creating** to avoid duplicates

## Available Tools

| Tool | Description |
|------|-------------|
| `rah_get_context` | Get graph overview — stats, hub nodes, dimensions, recent activity |
| `rah_add_node` | Create a new node |
| `rah_search_nodes` | Search nodes by keyword |
| `rah_get_nodes` | Load nodes by ID |
| `rah_update_node` | Update an existing node |
| `rah_create_edge` | Create connection between nodes |
| `rah_update_edge` | Update an edge explanation |
| `rah_query_edges` | Find edges for a node |
| `rah_list_dimensions` | List all dimensions |
| `rah_create_dimension` | Create a dimension |
| `rah_update_dimension` | Update/rename a dimension |
| `rah_delete_dimension` | Delete a dimension |
| `rah_list_guides` | List available guides (system + custom) |
| `rah_read_guide` | Read a guide by name |
| `rah_write_guide` | Create or update a custom guide |
| `rah_delete_guide` | Delete a custom guide |

## Guides

Guides are detailed instruction sets that teach Claude how to work with your knowledge base. System guides (schema, creating-nodes, edges, dimensions, extract) are bundled and immutable. You can create up to 10 custom guides for your own workflows.

Guides are stored at `~/Library/Application Support/RA-H/guides/` and shared with the main app.

## What's NOT Included

This is a lightweight CRUD server. Advanced features are handled by the main app:

- Embedding generation
- AI-powered edge inference
- Content extraction (URL, YouTube, PDF)
- Real-time SSE events

## Testing

```bash
# Test database connection
node -e "const {initDatabase,query}=require('./services/sqlite-client');initDatabase();console.log(query('SELECT COUNT(*) as c FROM nodes')[0].c,'nodes')"

# Run the server
node index.js
```
