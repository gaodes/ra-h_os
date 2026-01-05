# Context & Memory

> How RA-H decides what information to show the AI during conversations.

**How it works:** RA-H automatically identifies your 10 most-connected knowledge nodes (by edge count) and shares their titles with the AI as background context. When you focus on a specific node, the AI also sees a preview of that content. This means the AI always knows about your most important ideas without you having to manually select them.

---

## Context System Overview

Every conversation includes context assembled by the **context builder**. This context tells the AI about your knowledge base, available tools, and what you're currently working on.

### What Gets Included

| Block | Contents | Cached? |
|-------|----------|---------|
| **Base Context** | How nodes, edges, dimensions work; formatting rules | ✅ Yes |
| **Agent Instructions** | Role-specific prompts (ra-h, ra-h-easy, wise-rah, mini-rah) | ✅ Yes |
| **Tool Definitions** | Available tools and their parameters | ✅ Yes |
| **Workflow Definitions** | Available workflows (orchestrators only) | ✅ Yes |
| **Background Context** | Top 10 most-connected nodes (if enabled) | ✅ Yes |
| **Focused Nodes** | Currently open node(s) with content previews | ❌ No |

---

## Auto-Context System

Auto-context automatically includes your most important knowledge in every conversation. It replaces the old manual "pinning" system.

### How It Works

1. **Toggle:** Enable in Settings → Context tab
2. **Query:** Finds top 10 nodes by edge count (most connections = most important)
3. **Format:** Shows `[NODE:id:"title"] (edges: X)` for each hub node
4. **Agent behavior:** Agents see titles only; they call `queryNodes` or `getNodesById` when they need full content

### The Query

```sql
SELECT n.id, n.title, COUNT(DISTINCT e.id) AS edge_count
FROM nodes n
LEFT JOIN edges e ON (e.from_node_id = n.id OR e.to_node_id = n.id)
WHERE n.type IS NULL OR n.type != 'memory'
GROUP BY n.id
ORDER BY edge_count DESC, n.updated_at DESC
LIMIT 10
```

**Tie-breaking:** When nodes have equal edge counts, most recently updated wins.

### Settings Storage

**Location:** `~/Library/Application Support/RA-H/config/settings.json`

```json
{
  "autoContextEnabled": true,
  "lastPinnedMigration": "2025-12-09T00:00:00Z"
}
```

**Legacy migration:** If you had pinned nodes before the auto-context update, the system automatically enabled auto-context on first run.

### Context Block Format

When enabled, agents see this in their system prompt:

```
=== BACKGROUND CONTEXT ===
Top 10 most-connected nodes (important knowledge hubs). Use queryNodes/getNodesById if relevant.

[NODE:1573:"building ra-h - knowledge management system"] (edges: 47)
[NODE:4436:"Continual learning explains some interesting phenomena"] (edges: 32)
[NODE:3014:"Multi-Agent Research Systems: Insights from Simon Willison"] (edges: 28)
...
```

---

## Focused Nodes

Focused nodes are the node(s) you currently have open in the Focus panel.

### What Agents See

- **Primary focused node:** The active tab
- **Additional focused nodes:** Other open tabs
- **Content preview:** First ~25 words
- **Metadata:** Title, ID, link, dimensions, chunk status

### Example Format

```
=== FOCUSED NODES ===

### Primary: [NODE:4523:"How RAG systems work"]
Preview: Retrieval-augmented generation (RAG) combines information retrieval with language model generation to produce more accurate and grounded responses...
Link: https://example.com/rag-systems
Dimensions: research, ai, papers
Chunk status: chunked (embeddings available)

### Also Open:
- [NODE:4520:"Vector databases explained"] (25 words preview...)
```

---

## Context Caching

RA-H uses provider-specific caching to reduce costs and latency.

### Anthropic (Claude)

- **Explicit cache control:** Blocks marked with `cache_control: { type: 'ephemeral' }`
- **What's cached:** Base context, instructions, tools, workflows, background context
- **What's NOT cached:** Focused nodes (change too frequently)

### OpenAI (GPT)

- **Implicit caching:** Based on prefix matching
- **Same structure:** Identical blocks, just no explicit markers
- **Optimization:** Prompts structured for maximum cache reuse

---

## Agent-Specific Context

Different agents receive different context based on their role:

| Agent | Background Context | Workflows | Tools |
|-------|-------------------|-----------|-------|
| **ra-h / ra-h-easy** (orchestrators) | ✅ Yes | ✅ Yes | All |
| **wise-rah** (workflow executor) | ❌ No | ❌ No | Planner tools only |
| **mini-rah** (worker) | ❌ No | ❌ No | Executor tools only |

**Why orchestrators only:** Background context helps with general conversation. Workers execute specific tasks and don't need the full picture.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/services/helpers/contextBuilder.ts` | Assembles system prompts with caching |
| `src/services/context/autoContext.ts` | Auto-context query and formatting |
| `src/services/settings/autoContextSettings.ts` | Settings read/write helpers |
| `src/components/settings/ContextViewer.tsx` | Settings UI for auto-context toggle |

---

## Legacy: Memory System (Removed)

The automatic memory extraction pipeline has been **removed**. Previously, RA-H would analyze conversations and create "memory" nodes automatically. This system was removed because:

1. Memory nodes cluttered the database
2. Quality was inconsistent
3. Users preferred explicit knowledge capture

**Existing memory nodes:** Still in the database but excluded from auto-context (filtered by `type != 'memory'`).

**Future approach:** Store long-term knowledge as regular nodes with explicit dimensions rather than automatic extraction.
