# RA-OS

```
 ██████╗  █████╗       ██╗  ██╗
 ██╔══██╗██╔══██╗      ██║  ██║
 ██████╔╝███████║█████╗███████║
 ██╔══██╗██╔══██║╚════╝██╔══██║
 ██║  ██║██║  ██║      ██║  ██║
 ╚═╝  ╚═╝╚═╝  ╚═╝      ╚═╝  ╚═╝
```

A lightweight local knowledge graph UI with MCP server. Connect your AI coding agents to a personal knowledge base. BYO API keys, no cloud dependencies.

## What is RA-OS?

RA-OS is a stripped-down version of RA-H focused on being a **knowledge management backend for AI agents**. It provides:

- **2-panel UI** – Nodes list + focus panel for viewing/editing knowledge
- **SQLite + sqlite-vec** – Local vector database with semantic search
- **MCP Server** – Connect Claude Code, Cursor, or any MCP-compatible AI assistant

**What's removed:** Built-in chat agents, voice features, delegation system. RA-OS is designed for technical users who want to bring their own AI agents via MCP.

## Platform Support

| Platform | Status |
|----------|--------|
| macOS (Apple Silicon) | Supported |
| macOS (Intel) | Supported |
| Linux | Requires manual sqlite-vec build |
| Windows | Requires manual sqlite-vec build |

## Quick Start

```bash
git clone https://github.com/bradwmorris/ra-h_os.git
cd ra-h_os
npm install
npm rebuild better-sqlite3
scripts/dev/bootstrap-local.sh
npm run dev
```

Open http://localhost:3000 → **Settings → API Keys** → add your OpenAI key (for embeddings).

## Connecting AI Agents via MCP

RA-OS includes an MCP server that lets Claude Code, Cursor, and other AI assistants read/write your knowledge graph.

### Quick Setup (Recommended)

Add to your `~/.claude.json`:

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

**That's it.** Works without RA-OS running. Requires Node.js 18+.

### Alternative: Local Development

If you're developing RA-OS and want to use the local server:

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

First install dependencies: `cd apps/mcp-server-standalone && npm install`

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `rah_add_node` | Create a new knowledge node |
| `rah_search_nodes` | Search nodes by text |
| `rah_update_node` | Update an existing node |
| `rah_get_nodes` | Get nodes by ID |
| `rah_create_edge` | Connect two nodes |
| `rah_query_edges` | Find connections |
| `rah_list_dimensions` | List all dimensions |
| `rah_create_dimension` | Create a tag/category |
| `rah_update_dimension` | Update a dimension |
| `rah_delete_dimension` | Delete a dimension |

### HTTP MCP Server (Real-time UI updates)

If you want the RA-OS UI to update in real-time when nodes are created:

1. Start RA-OS: `npm run dev`
2. Use HTTP config:

```json
{
  "mcpServers": {
    "ra-h": {
      "url": "http://127.0.0.1:44145/mcp"
    }
  }
}
```

## Project Layout

```
app/                 Next.js App Router
src/
  components/        UI components
  services/          Database, embeddings, workflows
  tools/             Available tools for workflows
apps/mcp-server/     MCP server (stdio + HTTP)
docs/                Local documentation
scripts/             Dev helpers
vendor/              Pre-built binaries (sqlite-vec)
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server at localhost:3000 |
| `npm run build` | Production build |
| `npm run type-check` | TypeScript validation |
| `npm run sqlite:backup` | Database snapshot |
| `npm run sqlite:restore` | Restore from backup |

## Documentation

- [docs/0_overview.md](docs/0_overview.md) – System overview
- [docs/2_schema.md](docs/2_schema.md) – Database schema
- [docs/8_mcp.md](docs/8_mcp.md) – MCP server details

## Linux/Windows Setup

The bundled `sqlite-vec` binary is macOS-only. For other platforms:

1. Clone https://github.com/asg017/sqlite-vec
2. Build for your platform
3. Place at `vendor/sqlite-extensions/vec0.so` (Linux) or `vec0.dll` (Windows)
4. Set `SQLITE_VEC_EXTENSION_PATH` in `.env.local`

Without sqlite-vec: UI, node CRUD, and basic search still work. Vector/semantic search requires it.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and PRs welcome.

## License

[MIT](LICENSE)
