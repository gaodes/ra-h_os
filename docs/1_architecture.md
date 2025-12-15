# System Architecture

## Overview

RA-H uses a multi-agent architecture with three specialized AI agents that collaborate to manage your knowledge base. The system is built around **nodes** (knowledge items), **edges** (relationships), and **dimensions** (categories).

## Core Concepts

### Nodes
Knowledge items stored in the database (papers, ideas, people, projects, videos, tweets, etc). Each node has:
- **Title** and **content**
- **Dimensions** (multi-tag categorization)
- **Metadata** (structured JSON)
- **Embeddings** (for semantic search)
- **Links** (for external sources)

### Edges
Directed relationships between nodes. Edges capture how nodes connect ("relates to", "inspired by", etc).

### Dimensions
Multi-select categorization tags. Nodes can have multiple dimensions. Some dimensions can be marked as "priority" for focused context.

## Agent Architecture

### Orchestrator Agents (Easy/Hard Mode)

**ra-h-easy (Easy Mode - Default)**
- **Model:** GPT-5 Mini (`openai/gpt-5-mini`)
- **Purpose:** Fast, low-latency orchestration for everyday tasks
- **Caching:** OpenAI implicit caching
- **Reasoning:** `reasoning_effort: light` for speed

**ra-h (Hard Mode)**
- **Model:** Claude Sonnet 4.5 (`anthropic/claude-sonnet-4.5`)
- **Purpose:** Deep reasoning for complex tasks
- **Caching:** Anthropic explicit prompt caching
- **Reasoning:** Stronger analytical capabilities

**Tools Available:**
- `queryNodes`, `queryEdge`, `searchContentEmbeddings`
- `webSearch`, `think`
- `executeWorkflow` (delegates to wise-rah)
- `createNode`, `updateNode`, `createEdge`, `updateEdge`
- `youtubeExtract`, `websiteExtract`, `paperExtract`

**Mode Switching:**
Users toggle via UI (⚡ Easy / 🔥 Hard). Choice persists in localStorage. **Seamless mid-conversation switching** - context maintained across mode changes.

### Wise RA-H (Workflow Executor)

**wise-rah**
- **Model:** GPT-5 (`openai/gpt-5`)
- **Purpose:** Executes predefined workflows (integrate, deep analysis)
- **Direct write access:** Calls `updateNode` directly (no delegation)
- **Context isolation:** Returns summaries only to orchestrator

**Tools Available:**
- `queryNodes`, `getNodesById`, `queryEdge`, `searchContentEmbeddings`
- `webSearch`, `think`
- `updateNode` (append-only, enforced at tool level)

**Key Workflows:**
- **Integrate:** Database-wide connection discovery (5-step: plan → ground → search → contextualize → append)

### Mini RA-H (Delegate Workers)

**mini-rah**
- **Model:** GPT-4o Mini (`openai/gpt-4o-mini`)
- **Purpose:** Spawned for write operations, extraction, batch tasks
- **Execution:** Isolated context, returns summaries only

**Tools Available:**
- All read tools + `createNode`, `updateNode`, `createEdge`, `updateEdge`
- Extraction tools (`youtubeExtract`, `websiteExtract`, `paperExtract`)

## Prompt Caching

**Anthropic (Claude):**
- Explicit cache control blocks in system prompts
- Caches tool definitions, workflows, base context

**OpenAI (GPT-5/4o):**
- Implicit caching based on prefix matching
- Optimized prompts for cache reuse
- `reasoning_effort` parameter for speed/quality tradeoff

## Context Hygiene

**Orchestrator:**
- Maintains full conversation history
- Sees pinned nodes + focused node
- Delegates isolation ensures clean context

**Workers (wise-rah/mini-rah):**
- Execute in isolated sessions
- Return structured summaries only
- Do NOT pollute orchestrator context with tool execution details

## UI Integration

Users interact with a single interface that automatically routes requests to the appropriate agent based on:
- **Mode selection** (Easy/Hard)
- **Workflow triggers** (executeWorkflow → wise-rah)
- **Delegation needs** (mini-rah spawned in background)

All agents share the same **pinned context** (up to 10 nodes) plus the **focused node** for consistent knowledge access.
