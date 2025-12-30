# RA-H Open Source

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)

A local-first research workspace with the complete RA-H three-panel interface, vector search, content ingestion, workflows, and conversation agents. This edition removes the Mac packaging, hosted authentication, and subscription backend so you can run everything locally with your own API keys.

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| **macOS (Apple Silicon)** | ✅ Fully Supported | M1/M2/M3/M4 Macs |
| **macOS (Intel)** | ✅ Fully Supported | Pre-2020 Macs |
| **Linux** | 🚧 Coming Soon | Requires manual sqlite-vec build |
| **Windows** | 🚧 Coming Soon | Requires manual sqlite-vec build |

> **Note:** The bundled `sqlite-vec` and `yt-dlp` binaries are macOS-only. Linux/Windows users can still run the app but need to compile sqlite-vec manually. See [Advanced Setup](#advanced-setup-linuxwindows) below.

## Features

- **3-Panel interface** – Explore nodes, focus, and chat with the orchestrator in one view
- **Bring-your-own keys** – Works with your Anthropic/OpenAI keys only; nothing is sent to RA-H
- **Local SQLite + sqlite-vec** – Semantic search, workflows, and embeddings run on your machine
- **Content extraction** – YouTube, PDF, and web extraction pipelines included
- **Extensible workflows** – Integrate workflow + tool registry ship intact for further hacking
- **MCP Server** – Connect Claude, ChatGPT, or any MCP-compatible assistant to your knowledge graph

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+
- macOS (for pre-built sqlite-vec binary)

### Install & Bootstrap

```bash
git clone https://github.com/bradwmorris/ra-h_os.git
cd ra-h_os
npm install
npm rebuild better-sqlite3
scripts/dev/bootstrap-local.sh
npm run dev
```

Open http://localhost:3000, then go to **Settings → API Keys** and add your OpenAI/Anthropic keys.

### Environment

- `.env.example` documents all supported variables
- Run the bootstrap script to create `.env.local`
- Custom paths: set `SQLITE_DB_PATH` and `SQLITE_VEC_EXTENSION_PATH`

## Project Layout

```
app/                 Next.js App Router entrypoints
src/
  components/        UI building blocks
  services/          Agents, embeddings, ingestion, storage, workflows
  tools/             Agent tools (queryNodes, etc.)
  config/            Prompts, workflows
apps/mcp-server/     MCP server for external AI assistants
docs/                Architecture + schema docs
scripts/             Local dev helpers (bootstrap, sqlite backup/restore)
vendor/              Pre-built binaries (sqlite-vec, yt-dlp)
```

## Development Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Local dev server at localhost:3000 |
| `npm run build` | Production build |
| `npm run type-check` | TypeScript validation |
| `npm run lint` | ESLint check |
| `npm run sqlite:backup` | Database snapshot |
| `npm run sqlite:restore` | Restore from backup |

## Documentation

- [docs/README.md](docs/README.md) – Documentation index
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) – Common issues and fixes
- [docs/0_overview.md](docs/0_overview.md) – Product background
- [docs/1_architecture.md](docs/1_architecture.md) – Technical architecture
- [docs/2_schema.md](docs/2_schema.md) – Database schema + sqlite-vec
- [docs/8_mcp.md](docs/8_mcp.md) – MCP server setup

## Advanced Setup (Linux/Windows)

The app works on Linux/Windows but requires manually compiled binaries:

### sqlite-vec (required for vector search)

1. Clone: https://github.com/asg017/sqlite-vec
2. Build for your platform (see their README)
3. Place binary at:
   - Linux: `vendor/sqlite-extensions/vec0.so`
   - Windows: `vendor/sqlite-extensions/vec0.dll`
4. Update `SQLITE_VEC_EXTENSION_PATH` in `.env.local`

### yt-dlp (required for YouTube extraction)

1. Download from: https://github.com/yt-dlp/yt-dlp/releases
2. Place at `vendor/bin/yt-dlp` (or `yt-dlp.exe` on Windows)
3. Make executable: `chmod +x vendor/bin/yt-dlp` (Linux)

**What works without sqlite-vec:** UI, node CRUD, basic search, chat, content extraction

**What requires sqlite-vec:** Semantic/vector search, embedding-based agent tools

## Contributing

Issues and PRs are welcome! Please read:
- [CONTRIBUTING.md](CONTRIBUTING.md) – Contribution guidelines
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) – Community standards
- [SECURITY.md](SECURITY.md) – Vulnerability reporting

## License

Released under the [MIT License](LICENSE).
