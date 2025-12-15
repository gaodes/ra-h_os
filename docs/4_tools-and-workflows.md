# Tools & Workflows

## Tool Architecture

Tools are organized into three categories with role-based access control.

### Core Tools (All Agents)

Read-only graph operations available to orchestrators, executors, and planners:

- **queryNodes** - Search nodes by title/content/dimensions
- **getNodesById** - Retrieve full node data by ID array
- **queryEdge** - Inspect existing edges between nodes
- **searchContentEmbeddings** - Semantic search across chunk embeddings

### Orchestration Tools (Orchestrators Only)

Workflow and delegation tools for ra-h and ra-h-easy:

- **webSearch** - External web search via Tavily
- **think** - Internal reasoning/planning (logged to metadata)
- **executeWorkflow** - Delegate to wise-rah for predefined workflows
- **delegateToMiniRAH** - Spawn mini-rah worker for tasks (deprecated in favor of direct execution)
- **delegateToWiseRAH** - Delegate to wise-rah (now replaced by executeWorkflow)

### Execution Tools (Workers + Orchestrators)

Write operations and extraction - available to mini-rah, wise-rah, and orchestrators:

- **createNode** - Create new knowledge nodes
- **updateNode** - Append content to existing nodes (append-only enforced at tool level)
- **createEdge** - Create relationships between nodes
- **updateEdge** - Modify edge metadata
- **youtubeExtract** - Extract transcripts from YouTube videos
- **websiteExtract** - Extract content from web pages
- **paperExtract** - Extract text from PDF papers

## Tool Access by Agent

### ra-h / ra-h-easy (Orchestrators)
**Tools:** Core + Orchestration + Execution (minus delegation helpers)
- Direct write access (createNode, updateNode, createEdge, updateEdge)
- Extraction tools (youtube, website, paper)
- Workflow execution (executeWorkflow)
- External search (webSearch)

### wise-rah (Planner)
**Tools:** Core + webSearch + think + updateNode
- **Direct write access** via updateNode (append-only)
- **NO delegation** - executes workflows autonomously
- Database-wide search capabilities
- Minimal tool set for focused workflow execution

### mini-rah (Executor)
**Tools:** Core + Execution + webSearch + think
- All read tools
- All write tools (createNode, updateNode, createEdge, updateEdge)
- All extraction tools
- **NO delegation** - leaf workers only

## Tool Registry

**Location:** `/src/tools/infrastructure/registry.ts`

**Structure:**
```typescript
TOOL_SETS = {
  core: { queryNodes, getNodesById, queryEdge, searchContentEmbeddings },
  orchestration: { webSearch, think, delegateToMiniRAH, executeWorkflow, ... },
  execution: { createNode, updateNode, createEdge, updateEdge, youtubeExtract, websiteExtract, paperExtract }
}
```

**Role mappings:**
- `ORCHESTRATOR_TOOL_NAMES` - Core + webSearch + think + executeWorkflow + Execution
- `EXECUTOR_TOOL_NAMES` - Core + Execution + webSearch + think (no delegation)
- `PLANNER_TOOL_NAMES` - Core + webSearch + think + updateNode

## Workflows

**Location:** `/src/services/workflows/registry.ts`

Workflows are **code-first** - defined in registry, not database. Users cannot create custom workflows.

### Integrate Workflow

**Key:** `integrate`  
**Executor:** wise-rah (planner role)  
**Purpose:** Database-wide connection discovery for focused node  
**Cost:** ~$0.18/execution (GPT-5, 18 tool calls max)

**Process (5 steps):**

1. **Plan** - Call `think` to outline approach
2. **Ground** - Identify node type, extract entities (names, projects, concepts), summarize core insight
3. **Search** - Database-wide search using extracted entities
   - Obvious connections: queryNodes for specific names/projects/techniques
   - Thematic connections: searchContentEmbeddings for shared concepts
   - Finds 3-8 strong connections (not 20 weak ones)
4. **Contextualize** - Brief 1-2 sentence relevance to pinned context
5. **Append** - Call updateNode ONCE with Integration Analysis section

**Output format:**
```markdown
## Integration Analysis

[2-3 sentences: what this node is, why it matters, core insight]

**Database Connections:**
- [NODE:123:"Title"] — [why: authorship/shared concept/dependency/contradiction]
- [NODE:456:"Title"] — [why: ...]
- [continue for 3-8 connections]

**Relevance:** [1-2 sentences connecting to user's pinned context]
```

**Key features:**
- **Database-first search** - Ignores pinned context during search (step 3), uses it only for relevance explanation (step 4)
- **Entity extraction** - Grounding step identifies searchable entities before searching
- **Append-only** - updateNode enforced at tool level (cannot overwrite)
- **Single update** - Calls updateNode EXACTLY once per workflow
- **Works for any node type** - Adapts to person/project/paper/idea/video/tweet/technique

**Invocation:**
```typescript
// User: "run integrate workflow"
// Orchestrator calls: executeWorkflow({ workflow_key: 'integrate' })
// System delegates to wise-rah with workflow instructions
```

## Workflow Registry

**Definition:**
```typescript
{
  id: 1,
  key: 'integrate',
  displayName: 'Integrate',
  description: 'Deep analysis and connection-building for focused node',
  instructions: INTEGRATE_WORKFLOW_INSTRUCTIONS,
  enabled: true,
  requiresFocusedNode: true,
  primaryActor: 'oracle',
  expectedOutcome: 'Focused node updated with insights; 3-5 high-value edges created'
}
```

**Adding new workflows:**
1. Create instructions file in `/src/config/workflows/[name].ts`
2. Add workflow definition to `WorkflowRegistry.WORKFLOWS`
3. Immediately available to orchestrators (no database changes needed)

## Tool Execution Flow

**Orchestrator conversation:**
1. User sends message → ra-h/ra-h-easy
2. Agent calls tools directly (createNode, queryNodes, etc.)
3. Agent synthesizes response from tool results
4. Response includes [NODE:id:"title"] references for UI rendering

**Workflow execution:**
1. User: "run integrate workflow"
2. ra-h/ra-h-easy calls `executeWorkflow({ workflow_key: 'integrate' })`
3. System spawns wise-rah session with workflow instructions
4. wise-rah executes 5-step process autonomously
5. wise-rah returns summary to orchestrator
6. Orchestrator shows summary to user

**Delegation (legacy, rarely used):**
1. Orchestrator calls `delegateToMiniRAH({ task, context, expected_outcome })`
2. System creates agent_delegations row (status: 'queued')
3. Mini-rah spawned in isolated session
4. Mini-rah executes task, returns structured summary
5. Summary shown in delegation tab (persists until manually closed)
