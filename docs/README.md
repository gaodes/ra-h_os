# RA-H Documentation

Technical documentation for RA-H — AI-powered knowledge management.

## Quick Links

- **Website:** [ra-h.app](https://ra-h.app)
- **Download:** [ra-h.app/download](https://ra-h.app/download)
- **Open Source:** [github.com/bradwmorris/ra-h_os](https://github.com/bradwmorris/ra-h_os)

## Documentation Index

| # | Document | Description |
|---|----------|-------------|
| 0 | [Overview](./0_overview.md) | What is RA-H, design philosophy, tech stack |
| 1 | [Architecture](./1_architecture.md) | Agent hierarchy, system design |
| 2 | [Schema](./2_schema.md) | Database schema, nodes, edges, embeddings |
| 3 | [Context & Memory](./3_context-and-memory.md) | Auto-context system, how agents see your knowledge |
| 4 | [Tools & Workflows](./4_tools-and-workflows.md) | Available tools, editable workflows |
| 5 | [Logging & Evals](./5_logging-and-evals.md) | Debugging, evaluation framework |
| 6 | [UI](./6_ui.md) | 3-panel layout, views, Settings |
| 7 | [Voice](./7_voice.md) | Voice interface (STT/TTS) |
| 8 | [MCP Server](./8_mcp.md) | External agent connector (Claude Code, etc.) |
| 9 | [Open Source](./9_open-source.md) | Sync strategy, repo differences |

## For Users

Start here:
1. [Overview](./0_overview.md) — What RA-H is and how it works
2. [MCP Server](./8_mcp.md) — Connect Claude Code to your knowledge base

## For Developers

If you're contributing or self-hosting:
1. [Architecture](./1_architecture.md) — Understand the agent hierarchy
2. [Schema](./2_schema.md) — Database structure
3. [Tools & Workflows](./4_tools-and-workflows.md) — How to extend RA-H
4. [Open Source](./9_open-source.md) — Contribution workflow

## Development Process

Internal development docs are in `docs/development/`:
- `process/` — Workflow, handoff, kickstart
- `backlog/` — Task backlog
- `prd-*.md` — Product requirement documents
- `completed/` — Archived PRDs
