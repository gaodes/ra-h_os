# User Interface

## 3-Panel Layout

RA-H uses a fixed 3-panel desktop layout optimized for knowledge work.

### Left Panel: Nodes
**Purpose:** Browse and manage your knowledge base

**Features:**
- **Search bar** - Cmd+K global search modal
- **Dimension filters** - Multi-select dimension tags
- **Node list** - Scrollable list of filtered nodes
- **Quick actions** - Pin/unpin, delete, open in focus

**Node display:**
- Title + description preview
- Dimension tags
- Last updated timestamp
- Pin indicator

### Middle Panel: Focus
**Purpose:** Active workspace for current node(s)

**Tabbed interface:**
- **Primary tab** - Main focused node
- **Additional tabs** - Related nodes opened from conversations
- **Tab controls** - Close, reorder, switch

**Node detail view:**
- Full title and content
- Metadata (created, updated, type, link)
- Dimension tags (editable)
- Edge list (incoming/outgoing connections)
- Quick Add bar (bottom) - Create related nodes

**Content rendering:**
- Markdown support
- `[NODE:id:"title"]` auto-links to clickable node references
- Syntax highlighting for code blocks
- YouTube embeds (if link present)

### Right Panel: Helpers
**Purpose:** AI conversation interface

**Tabbed interface:**
- **ra-h tab** - Main orchestrator conversation
- **Delegation tabs** - Background worker tasks (mini-rah)
- **Tab lifecycle** - Manual close only (persist until user closes)

**Conversation view:**
- Message history (user + assistant)
- Tool call visibility (collapsed by default)
- Token/cost tracking per message
- Node references auto-linked

**Input controls:**
- Text input with Shift+Enter for multiline
- Submit button
- Mode toggle (⚡ Easy / 🔥 Hard)
- Thread reset button

**Mode switching:**
- Easy mode: GPT-5 Mini (fast, cheap)
- Hard mode: Claude Sonnet 4.5 (deep reasoning)
- Seamless mid-conversation switching
- localStorage persists user choice

## Settings Panel

**Access:** Settings icon (top-right)

**Tabs:**
1. **General** - App info, version, data location
2. **Agents** - View agent configurations (ra-h, ra-h-easy, mini-rah, wise-rah)
3. **Workflows** - Available workflows (integrate)
4. **Logs** - Activity feed (last 100 entries)
5. **Analytics** - Token usage and cost breakdown
6. **API Keys** - Configure your Anthropic/OpenAI/Tavily keys (required for operation)

**Logs view:**
- Table/action filtering
- Timestamp, table, action, summary
- Detailed JSON snapshot on click
- Real-time updates

**Analytics view:**
- Total tokens used
- Total cost (USD)
- Breakdown by agent
- Breakdown by thread
- Average cost per chat

## Search (Cmd+K)

**Trigger:** Cmd+K keyboard shortcut

**4-tier relevance ranking:**
1. **Exact title match** - Highest priority
2. **Title substring** - High priority
3. **FTS content match** - Medium priority
4. **Semantic embedding** - Fallback for conceptual matches

**Features:**
- Type-ahead search
- Instant results (no search button)
- Click to open node in Focus panel
- Recent searches preserved (session only)

**UI:**
- Modal overlay
- Search input
- Results list (grouped by relevance tier)
- Keyboard navigation (arrow keys, Enter to select)

## Quick Add

**Location:** Bottom of Focus panel

**Purpose:** Rapidly create nodes related to current focus

**Flow:**
1. User types title in Quick Add input
2. Presses Enter
3. System creates node via `createNode` tool
4. Auto-creates edge from focused node to new node
5. New node opens in adjacent tab

**Features:**
- Single-field input (title only)
- Inherit dimensions from focused node
- Automatic edge creation with source='quick_add'
- Real-time feedback (loading state, success confirmation)

## Node References

**Format:** `[NODE:id:"title"]`

**Rendering:**
- Clickable labels in chat messages
- Clickable labels in node content
- Hover tooltip with node preview
- Click → open node in Focus panel

**Usage:**
- Agents automatically use this format
- Middleware converts to clickable UI elements
- Enables knowledge graph navigation from conversations

## Delegation Tabs

**Purpose:** Show background worker task progress

**Lifecycle:**
- Created when mini-rah delegated
- Persist until manually closed (no auto-cleanup)
- Show task, status, summary, result
- Tool calls visible (collapsed)

**Status indicators:**
- queued - Task waiting
- in_progress - Worker executing
- completed - Success
- failed - Error with details

**Close behavior:**
- Manual close only (X button)
- DELETE request to `/api/rah/delegations/[sessionId]`
- Permanent deletion from database
