# Context & Memory

## Context Builder

The context builder assembles the information each agent sees during conversations. It creates **cacheable blocks** (for Anthropic) and structured context for all agents.

### Context Structure

Every agent receives:

**1. Base Context**
- How nodes, edges, and dimensions work
- Node reference format: `[NODE:id:"title"]`
- If auto-context is enabled, BACKGROUND CONTEXT explains that the 10 most-connected nodes will be listed later
- Pronouns like "this conversation/paper/video" refer to focused node

**2. Agent Instructions**
- Agent-specific system prompt (ra-h, ra-h-easy, wise-rah, mini-rah)
- Role-specific behavior guidelines
- Execution approach and response style

**3. Tool Definitions**
- Role-specific tools (orchestrator/executor/planner)
- Each tool's description and parameters
- Usage guidelines

**4. Workflow Definitions** (orchestrators only)
- Available workflows (integrate, etc.)
- Workflow descriptions and triggers
- Only shown to ra-h and ra-h-easy

**5. Background Context (auto-context hubs)** (orchestrators only)
- Optional block controlled by `~/Library/Application Support/RA-H/config/settings.json`
- Lists the 10 nodes with the highest edge counts (ID + title + edge count)
- Reminds agents to call `queryNodes`/`getNodesById` for full content
- Ordered by edge count, then most recently updated to break ties

**6. Focused Nodes**
- Primary focused node (active tab)
- Additional focused nodes (other open tabs)
- 25-word content previews
- Chunk status and embedding availability
- Link information

### Context Caching

**Anthropic (Claude):**
- Explicit cache control blocks (`cache_control: {type: 'ephemeral'}`)
- Caches base context, instructions, tools, workflows, background context
- Focused nodes NOT cached (changes frequently)

**OpenAI (GPT):**
- Implicit caching based on prefix matching
- Same block structure for consistency
- No explicit cache control markers needed

### Truncation Strategy

- **Background context:** IDs + titles only to keep the block lightweight
- **Focused nodes:** 25-word previews
- **Full content access:** Agents use `queryNodes`, `getNodesById`, `searchContentEmbeddings` for complete content
- **Chunk status indicator:** Shows if embeddings are available (avoid re-extraction)

## Memory System (Legacy)

The automatic memory pipeline has been removed. Existing memory nodes remain in the database for archival purposes, but no new ones are created and they are excluded from auto-context. The old files (`src/services/memory/**`) have been deleted along with the `ENABLE_CHAT_MEMORY_PIPELINE` toggle. Future improvements should store long-term knowledge as normal nodes with explicit dimensions rather than a background pipeline.
6. Update checkpoint in `chat_memory_state`

**Location:**
- Pipeline: `/src/services/memory/synthesis/chatMemoryPipeline.ts`
- Trigger: `/src/services/chat/middleware.ts:168-178`
- Extraction: `/src/services/memory/synthesis/llmSynthesis.ts`

### Memory Node Structure

```typescript
{
  type: 'memory',
  title: 'Insight on [subject]',
  description: 'Multi-line list of facts',
  content: 'Second-person statements combined',
  metadata: {
    category: 'identity' | 'interests' | 'models' | 'preferences' | 'relationships',
    subject_type: 'person' | 'project' | 'concept' | 'resource' | 'organization' | 'workflow',
    source_thread: string,
    source_helper: string,
    importance: 'low' | 'medium' | 'high',
    focused_node_titles: string[],
    canonical_key: string | null,
    subject: string
  }
}
```

### Memory Categories

- **identity** - Who you are, your roles, background
- **interests** - What you're curious about, learning, exploring
- **models** - How you think, mental frameworks, approaches
- **preferences** - What you like/dislike, priorities, values
- **relationships** - Connections to people, projects, concepts

### Subject Types

Memory extraction classifies subjects into these types:

- **person** - Individual people (yourself or collaborators)
- **project** - Projects, products, or initiatives
- **concept** - Ideas, theories, mental models, beliefs
- **resource** - Tools, articles, books, references
- **organization** - Companies, institutions, communities
- **workflow** - Processes, systems, methodologies

### Importance Levels

Each memory fact is classified by importance:

- **high** - Explicitly marked as priority, main project, strong belief ("is crucial", "must")
- **medium** - Normal statements and observations (default)
- **low** - Tentative, uncertain, or exploratory statements

## Auto-Context Toggle

Auto-context replaces manual pinning. When enabled, BACKGROUND CONTEXT includes the 10 nodes with the highest edge counts.

**How it works:**
1. Settings UI exposes a toggle inside the Context tab.
2. The toggle writes to `~/Library/Application Support/RA-H/config/settings.json`.
3. Context builder and workflows read that file on each request (missing file defaults to `false`).
4. When enabled, the following query runs once per request:

```sql
SELECT n.id,
       n.title,
       COUNT(DISTINCT e.id) AS edge_count,
       n.updated_at
FROM nodes n
LEFT JOIN edges e ON (e.from_node_id = n.id OR e.to_node_id = n.id)
WHERE n.type IS NULL OR n.type != 'memory'
GROUP BY n.id
ORDER BY edge_count DESC, n.updated_at DESC
LIMIT 10;
```

**Notes:**
- Only orchestrators (ra-h / ra-h-easy) see the block.
- Titles + edge counts are shown; agents must call `queryNodes`/`getNodesById` for content.
- Users who previously pinned nodes are auto-migrated to `autoContextEnabled: true` the first time the toggle helper runs and sees legacy pins.
