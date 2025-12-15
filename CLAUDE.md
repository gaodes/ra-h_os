# RA-H Open Source - Knowledge Management System

## What This Is
LLM-powered knowledge management system built for emergence and flexibility. This is the **open source, self-hosted version** with BYO (bring your own) API keys.

## Tech Stack
- Next.js 15 + TypeScript + Tailwind CSS
- SQLite + sqlite-vec (vector search)
- Anthropic (Claude) + OpenAI (GPT) models via Vercel AI SDK
- 3-panel UI: Nodes | Focus | Helpers

## Quick Start
```bash
git clone https://github.com/bradwmorris/ra-h_os.git
cd ra-h_os
npm install
npm rebuild better-sqlite3
scripts/dev/bootstrap-local.sh
npm run dev
```

Open http://localhost:3000 and enter your API keys (OpenAI + Anthropic).

## Agent System
**Orchestrator (Easy Mode):** GPT-5 Mini - DEFAULT - fast, cheap orchestration
**Orchestrator (Hard Mode):** Claude Sonnet 4.5 - deep reasoning (toggle via UI)
**Oracle (Wise ra-h):** GPT-5 - complex workflows, multi-step planning
**Delegates:** GPT-4o mini - spawned for write operations, extraction, batch tasks

Tools available: queryNodes, queryEdge, searchContentEmbeddings, webSearch, think, executeWorkflow, createNode, updateNode, createEdge, updateEdge, youtubeExtract, websiteExtract, paperExtract

## Workflows System
- **Code-first registry:** Defined in `src/services/workflows/registry.ts`
- **Integrate workflow:** Database-wide connection discovery for focused nodes
  - 5-step process: plan → ground → search → contextualize → append
  - Finds 3-8 strong connections across your database

## Database
- SQLite at `~/Library/Application Support/RA-H/db/rah.sqlite`
- Schema defined in `docs/2_schema.md`
- Health check: `GET /api/health/db`

## Key Files
- `src/services/agents/` - Agent executors and delegation
- `src/tools/` - All available tools
- `src/config/prompts/` - Agent system prompts
- `src/services/workflows/` - Workflow definitions
- `src/components/` - React components

## Documentation
- `docs/0_overview.md` - System overview
- `docs/1_architecture.md` - Architecture details
- `docs/2_schema.md` - Database schema
- `docs/4_tools-and-workflows.md` - Tools reference

## Contributing
See `CONTRIBUTING.md` for guidelines. Issues and PRs welcome!

## License
MIT - see LICENSE file
