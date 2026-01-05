# RA-H Overview

## What is RA-H?

RA-H is an AI-powered knowledge management system designed for researchers, thinkers, and anyone who works with ideas. It learns how you think and helps connect ideas across your knowledge base.

**Website:** [ra-h.app](https://ra-h.app)
**Open Source:** [github.com/bradwmorris/ra-h_os](https://github.com/bradwmorris/ra-h_os)

## Design Philosophy

**Non-prescriptive & emergent** — The system doesn't force you into folders or predefined categories. Organization emerges naturally from your actual content. The structure adapts to how you think, not the other way around.

**Everything is connected** — Every piece of knowledge can potentially connect to any other. Connections aren't just links — they carry context, explanation, and meaning.

**Local-first** — Your knowledge network belongs to you, not a platform. Your thinking, research, and connections all belong to you in a portable format you control.

**Human + AI** — You guide, AI assists. Create custom workflows. Always in control of your knowledge.

## Tech Stack

- **Frontend:** Next.js 15, TypeScript, Tailwind CSS
- **Database:** SQLite + sqlite-vec (vector search)
- **AI Models:** Anthropic Claude + OpenAI GPT via Vercel AI SDK
- **Desktop:** Tauri (Mac app)
- **MCP Server:** Local connector for Claude Code and external agents

## Current Status

- **Version:** v0.1.21 (January 2026)
- **Platforms:**
  - Mac app (download at [ra-h.app/download](https://ra-h.app/download))
  - Open source self-hosted (BYO API keys)
- **License:** MIT (open source version)

## Two Ways to Use RA-H

| Version | Best For | Get It |
|---------|----------|--------|
| **Mac App** | Most users. One-click install, auto-updates, optional subscription features | [ra-h.app/download](https://ra-h.app/download) |
| **Open Source** | Developers, self-hosters, contributors. BYO API keys, full control | [GitHub](https://github.com/bradwmorris/ra-h_os) |

Both versions use the same core codebase. The Mac app adds packaging, auth, and subscription features. The open source version is fully functional with your own API keys.

## Key Features

- **3-panel interface:** Nodes list, Focus view, Helpers panel
- **AI agents:** Orchestrator for chat, workflows for deep analysis
- **Graph database:** Nodes and edges with semantic search
- **MCP server:** Connect Claude Code and other external agents
- **Workflows:** Code-first automation (Integrate, custom workflows)
- **Extraction tools:** YouTube, websites, PDFs

## Documentation

| Doc | Description |
|-----|-------------|
| [Architecture](./1_architecture.md) | Agent hierarchy, system design |
| [Schema](./2_schema.md) | Database schema, node/edge structure |
| [Context & Memory](./3_context-and-memory.md) | How context flows through the system |
| [Tools & Workflows](./4_tools-and-workflows.md) | Available tools, workflow system |
| [Logging & Evals](./5_logging-and-evals.md) | Debugging, evaluation framework |
| [UI](./6_ui.md) | Component structure, panels, views |
| [Voice](./7_voice.md) | Voice interface (STT/TTS) |
| [MCP](./8_mcp.md) | External agent connector setup |
| [Open Source](./9_open-source.md) | Sync strategy between repos |
