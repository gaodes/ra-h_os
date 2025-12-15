# RA-H Open Source

A local-first research workspace with the complete RA-H three-panel interface, vector search, content ingestion, workflows, and conversation agents. This edition removes the Mac packaging, hosted authentication, and subscription backend so you can run everything locally with your own API keys.

## Features
- **3-Panel interface** – Explore nodes, focus, and chat with the orchestrator in one view.
- **Bring-your-own keys** – Works with your Anthropic/OpenAI keys only; nothing is sent to RA-H.
- **Local SQLite + sqlite-vec** – Semantic search, workflows, and memories run on your machine.
- **Content extraction** – YouTube, PDF, and web extraction pipelines included.
- **Extensible workflows** – Integrate workflow + tool registry ship intact for further hacking.

## Getting Started

### Prerequisites
- Node.js 20+
- npm 10+
- SQLite with `sqlite-vec` extension (prebuilt macOS binary is under `vendor/sqlite-extensions/vec0.dylib`; see `docs/2_schema.md` for build instructions on Linux/Windows)

### Install & Bootstrap
```bash
git clone https://github.com/bradwmorris/ra-h_os.git
cd ra-h_os
npm install
scripts/dev/bootstrap-local.sh        # seeds SQLite schema + local env template
npm run dev                           # http://localhost:3000
```

When the UI loads, open **Settings → API Keys** and paste your OpenAI/Anthropic keys. They are stored locally via `src/services/storage/apiKeys.ts`.

### Environment
- `.env.example` documents every supported variable and defaults to `NEXT_PUBLIC_DEPLOYMENT_MODE=local`.
- Custom database paths: set `SQLITE_DB_PATH` and `SQLITE_VEC_EXTENSION_PATH`.
- No `.env.local` ships with the repo—run the bootstrap script to create yours.

## Project Layout
```
app/                 Next.js App Router entrypoints
components/          UI building blocks (auth/tauri removed)
docs/                Architecture + schema docs (updated for local mode)
scripts/             Local dev helpers (bootstrap, sqlite backup/restore, audits)
src/services/        Agents, embeddings, ingestion, storage, workflows
vendor/sqlite-extensions/vec0.dylib  macOS sqlite-vec build
```

## Development Scripts
- `npm run dev` – Local Next.js dev server (local mode forced)
- `npm run build` / `npm start` – Production build/start in local-only mode
- `npm run lint`, `npm run type-check` – Quality gates
- `npm run sqlite:backup` / `npm run sqlite:restore` – Database snapshots

## Documentation
- `docs/0_overview.md` – Product background
- `docs/1_architecture.md` – Agents, tools, and workflow internals
- `docs/2_schema.md` – SQLite schema + sqlite-vec setup
- `docs/4_tools-and-workflows.md` – Tool registry + workflow guide
- `docs/9_open-source.md` – Local BYO-key process tracking

Private runbooks, Supabase CRM docs, and Mac packaging instructions were removed from this tree. See `docs/os_docs/2025-02-09-open-source-porting-notes.md` for details on what was changed from the private repo.

## Contributing
Issues and PRs are welcome! Please open a draft PR with context on the feature/fix, list any new environment requirements, and include manual test notes. See `CONTRIBUTING.md` for the lightweight guidelines.

## License
Released under the [MIT License](LICENSE). By contributing you agree that your code is provided under the same license.
