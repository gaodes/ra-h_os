# RA-H Overview

## What is RA-H?

RA-H is a flexible knowledge management system designed for researchers. It learns how you think and helps connect ideas across your knowledge base.

For more information, visit [ra-h.app](https://ra-h.app)

## Design Philosophy

**Non-prescriptive & emergent** - The system doesn't force you into folders or predefined categories. Organization emerges naturally from your actual content. The structure adapts to how you think, not the other way around.

**Everything is connected** - Every piece of knowledge can potentially connect to any other. Connections aren't just links - they carry context, explanation, and meaning.

**Local-first** - Your knowledge network belongs to you, not a platform. Your thinking, research, and connections all belong to you in a portable format you control.

## Tech Stack

- **Frontend:** Next.js 15, TypeScript, Tailwind CSS
- **Database:** SQLite + sqlite-vec (vector search)
- **AI:** Anthropic Claude + OpenAI GPT via Vercel AI SDK
- **Deployment:** Currently beta web bundle, Mac app coming soon

## Current Status

- **Version:** 0.1.0 (Open Source)
- **Platform:** Web-based (Next.js server, local-only)
- **License:** MIT
