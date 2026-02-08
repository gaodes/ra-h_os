---
name: Extract
description: Extraction pre-check. When to reuse chunks vs re-extract.
immutable: true
---

# Content Extraction

## Pre-Check (REQUIRED)

Before running any extraction tool, always check the node first:

1. Call `getNodesById` on the target node
2. Check `chunk_status`:
   - **'chunked'** → content already extracted. Reuse existing chunks. Do NOT re-extract.
   - **'pending'** or missing → safe to extract
   - **'failed'** → previous extraction failed, safe to retry

3. Check if embeddings are available (chunk length > 0)
   - If available, use `searchContentEmbeddings` instead of re-extracting

## Extraction Tools

- **youtubeExtract** — YouTube videos (requires URL with video ID)
- **websiteExtract** — Web pages (uses Jina.ai for JS-rendered sites)
- **paperExtract** — PDF files (requires direct PDF URL)

## After Extraction

- The extracted content goes into `chunk` (full source)
- AI generates a `description` (grounding summary)
- Embeddings are created automatically
- Assign to relevant dimensions
