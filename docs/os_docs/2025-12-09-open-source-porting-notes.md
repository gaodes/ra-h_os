# RA-H Open Source Porting Notes (2025-12-09)

This document captures every change required to bring the private RA-H repo into a runnable, local-only open-source build.

## 1. Repo Copy & Cleanup
- `rsync` with an allowlist copied only source/docs/scripts into `~/Desktop/dev/ra-h_os`, excluding `.git`, `node_modules`, builds, backups, pgdata, logs, Mac artifacts, and tooling metadata (`.claude`, `.mcp.json`).
- Removed leftover build outputs and workflows: `.next/`, `.env*`, `.github/workflows/*`, `.claude/`, `.mcp.json`.
- Regenerated dependencies locally (`npm install --legacy-peer-deps`) and rebuilt native modules (`npm rebuild better-sqlite3`).

## 2. Rebrand & Licensing
- `package.json` renamed to `ra-h-open-source`, version reset to `0.1.0`, `private: false`, scripts force local mode, and Supabase/mac scripts removed.
- LICENSE switched from PolyForm to MIT; README rewritten for BYO-key locals; `.env.example` now defaults to `NEXT_PUBLIC_DEPLOYMENT_MODE=local` and drops Supabase fields.

## 3. UI & Runtime Simplification
- Deleted Supabase auth (`AuthProvider`, `AuthGate`, Supabase client/storage), Subscription/Usage components, auto-update wiring, and Tauri-specific helper files.
- `app/layout.tsx` renders a plain layout; `app/page.tsx` wraps the 3-panel UI in `LocalKeyGate` so first-run users see the API-key prompt.
- `ThreePanelLayout` now listens for `settings:open` to honor the LocalKeyGate button; `SettingsModal` shows only local tabs plus a "Local Mode" explainer.

## 4. Local-Only Key Flow
- `apiKeyService` still stores keys in `localStorage` but now broadcasts `api-keys:updated`. Added `/api/local/test-anthropic` so key validation occurs server-side (avoids browser CORS on `api.anthropic.com`).
- `ApiKeysViewer` uses that route to verify Anthropic keys; OpenAI testing already worked.
- Added `LocalKeyGate` overlay to block the workspace until at least one key is entered.

## 5. Backend Removal & BYO Keys End-to-End
- Removed Supabase token registry, backend fetch helpers, and all Supabase-facing scripts/docs.
- `RequestContext` now tracks `apiKeys` (OpenAI/Anthropic) for the current request.
- `useSSEChat` sends those keys with each `/api/rah/chat` call; the API route threads them into `resolveModel`, WiseRAH, and MiniRAH executors so delegations inherit the same BYO credentials.
- Chat logging/backend usage metadata dropped the Supabase proxies; everything runs directly against user-supplied keys.

## 6. Testing
- `npm run type-check` passes.
- Local dev requires: `npm rebuild better-sqlite3` once per machine, `scripts/dev/bootstrap-local.sh`, `npm run dev`.
- Manual smoke: open Settings → API Keys, add OpenAI + Anthropic keys (Anthropic test now succeeds), refresh; nodes/ui/chat all function.

## 7. Documentation Cleanup (2025-12-15)
- Removed `docs/development/completed/` (150+ internal PRDs)
- Removed `docs/development/process/` (internal workflow docs)
- Simplified `CLAUDE.md` for open source users
- Kept core architecture docs (`docs/0_overview.md` through `docs/6_ui.md`)

Keep this doc updated as future open-source specific changes land.
