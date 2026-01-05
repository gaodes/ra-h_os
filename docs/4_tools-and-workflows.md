# Tools & Workflows

> What actions the AI can take and how workflows automate multi-step processes.

**How it works:** AI agents have access to tools — functions they can call to read data, create nodes, search content, and more. Workflows are pre-written instruction sets that guide the AI through complex multi-step processes like finding connections across your knowledge base.

---

## Tools Overview

Tools are organized into three categories:

| Category | Purpose | Examples |
|----------|---------|----------|
| **Core** | Read-only graph operations | queryNodes, searchContentEmbeddings |
| **Orchestration** | Delegation and reasoning | executeWorkflow, think, webSearch |
| **Execution** | Write operations and extraction | createNode, updateNode, youtubeExtract |

---

## Core Tools (All Agents)

Read-only operations available to all agents:

### queryNodes
Search nodes by title, content, or dimensions.

```typescript
queryNodes({
  search?: string,      // Full-text search
  dimensions?: string[],// Filter by dimensions
  limit?: number        // Max results (default: 20)
})
```

### getNodesById
Retrieve full node data by ID array.

```typescript
getNodesById({
  ids: number[]  // Array of node IDs
})
```

### queryEdge
Inspect existing edges between nodes.

```typescript
queryEdge({
  from_node_id?: number,
  to_node_id?: number,
  limit?: number
})
```

### searchContentEmbeddings
Semantic search across chunk embeddings.

```typescript
searchContentEmbeddings({
  query: string,        // Search query
  node_id?: number,     // Scope to specific node
  limit?: number,       // Max results
  threshold?: number    // Similarity threshold (0-1)
})
```

### queryDimensions
Query and filter dimensions.

```typescript
queryDimensions({
  search?: string,      // Filter by name
  isPriority?: boolean, // Filter locked dimensions only
  limit?: number
})
```

### getDimension
Get a single dimension by exact name.

```typescript
getDimension({
  name: string  // Exact dimension name
})
```

---

## Orchestration Tools (Orchestrators Only)

Tools for reasoning and delegation:

### webSearch
External web search via Tavily.

```typescript
webSearch({
  query: string,
  max_results?: number
})
```

### think
Internal reasoning/planning (logged to metadata, not shown to user).

```typescript
think({
  thought: string  // Reasoning to log
})
```

### executeWorkflow
Delegate to wise-rah for predefined workflows.

```typescript
executeWorkflow({
  workflow_key: string  // e.g., "integrate"
})
```

---

## Execution Tools (Writers)

Write operations and content extraction:

### createNode
Create a new knowledge node.

```typescript
createNode({
  title: string,
  content?: string,
  description?: string,
  dimensions?: string[],
  link?: string,
  metadata?: object
})
```

### updateNode
Append content to existing nodes. **Append-only** — cannot overwrite.

```typescript
updateNode({
  id: number,
  content: string  // Appended to existing content
})
```

### createEdge
Create relationship between nodes.

```typescript
createEdge({
  from_node_id: number,
  to_node_id: number,
  context?: string  // Relationship description
})
```

### updateEdge
Modify edge metadata.

```typescript
updateEdge({
  id: number,
  context?: string,
  user_feedback?: number
})
```

### Dimension Tools

```typescript
createDimension({ name: string, description?: string })
updateDimension({ name: string, description?: string })
lockDimension({ name: string })    // Make priority dimension
unlockDimension({ name: string })  // Remove priority status
deleteDimension({ name: string })
```

### Extraction Tools

```typescript
youtubeExtract({ url: string })  // Extract transcript
websiteExtract({ url: string })  // Extract page content
paperExtract({ url: string })    // Extract PDF text
```

---

## Tool Access by Agent

| Agent | Core | Orchestration | Execution |
|-------|------|---------------|-----------|
| **ra-h / ra-h-easy** | ✅ All | webSearch, think, executeWorkflow | ✅ All |
| **wise-rah** | ✅ All | webSearch, think, delegateToMiniRAH | updateNode, createEdge |
| **mini-rah** | ✅ All | webSearch, think | ✅ All |

---

## Workflows

Workflows are multi-step instruction sets executed by wise-rah.

### User-Editable Workflows

**Users can create, edit, and delete workflows** from Settings → Workflows tab.

**Storage:** `~/Library/Application Support/RA-H/workflows/`

**Format:** JSON files with this structure:

```json
{
  "key": "integrate",
  "displayName": "Integrate",
  "description": "Deep analysis and connection-building for focused node",
  "instructions": "You are executing the INTEGRATE workflow...",
  "enabled": true,
  "requiresFocusedNode": true
}
```

### How Workflows Work

1. User says "run integrate workflow" (or similar)
2. Orchestrator calls `executeWorkflow({ workflow_key: 'integrate' })`
3. System spawns wise-rah session with workflow instructions
4. wise-rah executes steps autonomously (30-60+ seconds)
5. wise-rah returns summary to orchestrator
6. Orchestrator shows result to user

### Built-in Workflows

#### Integrate

**Key:** `integrate`
**Purpose:** Database-wide connection discovery
**Cost:** ~$0.18/execution

**5-Step Process:**

1. **Plan** — Call `think` to outline approach
2. **Ground** — Extract entities (names, projects, concepts) from focused node
3. **Search** — Database-wide search using extracted entities
4. **Contextualize** — Brief relevance explanation
5. **Append** — Call `updateNode` ONCE with Integration Analysis section

**Output Format:**

```markdown
## Integration Analysis

[2-3 sentences: what this node is, why it matters]

**Database Connections:**
- [NODE:123:"Title"] — [why relevant]
- [NODE:456:"Title"] — [why relevant]
...

**Relevance:** [1-2 sentences connecting to your context]
```

### Creating Custom Workflows

1. Go to Settings → Workflows
2. Click "New Workflow"
3. Fill in:
   - **Key** — unique identifier (lowercase, no spaces)
   - **Display Name** — shown in UI
   - **Description** — what it does
   - **Instructions** — the prompt for wise-rah
   - **Requires Focused Node** — whether a node must be selected
4. Save

### Workflow Instructions Tips

- Be explicit about steps and expected output
- Reference tools by name (wise-rah has: queryNodes, searchContentEmbeddings, updateNode, createEdge, webSearch, think)
- Specify output format precisely
- Include guardrails ("call updateNode exactly once")

---

## Tool Registry

**Location:** `src/tools/infrastructure/registry.ts`

**Structure:**

```typescript
TOOL_SETS = {
  core: { queryNodes, getNodesById, queryEdge, queryDimensions, getDimension, searchContentEmbeddings },
  orchestration: { webSearch, think, delegateToMiniRAH, executeWorkflow, ... },
  execution: { createNode, updateNode, createEdge, updateEdge, youtubeExtract, websiteExtract, paperExtract, ... }
}
```

---

## Key Design Decisions

### Append-Only Updates

`updateNode` is **append-only** — it cannot overwrite existing content. This prevents AI from accidentally destroying knowledge. The tool-level enforcement means workflows can't bypass this restriction.

### No Workflow Delegation Loops

wise-rah cannot call `executeWorkflow` or delegate to other wise-rah instances. This prevents infinite loops and keeps execution bounded.

### Isolated Execution

Workers (wise-rah, mini-rah) execute in isolated sessions. They return structured summaries only — they don't pollute orchestrator context with execution details.
