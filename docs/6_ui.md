# User Interface

> How to navigate and use RA-H's interface.

**How it works:** RA-H uses a 3-panel layout: browse nodes on the left, work with focused content in the middle, and chat with AI on the right. The chat panel is collapsible (Cmd+\\). Settings give you access to workflows, database views, a knowledge map, and more.

---

## 3-Panel Layout

```
┌─────────────┬─────────────────────────┬─────────────────┐
│   NODES     │        FOCUS            │    HELPERS      │
│   Panel     │        Panel            │    Panel        │
│             │                         │                 │
│ • Search    │ • Tabbed workspace      │ • AI chat       │
│ • Filters   │ • Node content          │ • Easy/Hard     │
│ • Folders   │ • Connections           │ • Delegations   │
│             │                         │                 │
└─────────────┴─────────────────────────┴─────────────────┘
```

---

## Left Panel: Nodes

Browse and manage your knowledge base.

### Features

- **Search bar** — Cmd+K opens global search modal
- **Dimension filters** — Multi-select dimension tags
- **Node list** — Scrollable list of filtered nodes
- **Folder view toggle** — Switch between list and folder views

### Node Display

Each node shows:
- Title + description preview
- Dimension tags (with custom icons)
- Last updated timestamp
- Node ID badge

### Folder View

Click the folder icon to open the **Folder View Overlay**:

**Two Modes:**

1. **Folders Mode** — Browse by dimension folders
   - Each dimension shows as a folder card
   - Drag nodes to folders to add dimensions
   - Click to view nodes in that dimension

2. **Filtered View Mode** — Multi-dimension filtering with views
   - Add multiple dimension filters
   - Choose view layout (List, Grid, Kanban)
   - Save views for quick access

---

## Filtered View System

### View Modes

| Mode | Description |
|------|-------------|
| **List** | Nodes grouped by dimension with section headers |
| **Grid** | Cards in responsive grid, grouped by dimension |
| **Kanban** | Columns per dimension, drag to move between |

### Compound Filters (AND Logic)

Add secondary filters to columns:

1. Add a filter (e.g., "inbox")
2. Click the `[+ AND]` button next to the dimension name
3. Select secondary dimension (e.g., "research")
4. Column now shows only nodes with BOTH dimensions

### Saved Views

Save filter + view combinations:

1. Configure your filters and view mode
2. Click the save icon
3. Name your view
4. Access from the "Saved Views" dropdown

### Drag-and-Drop

- **Reorder nodes** within views
- **Move between Kanban columns** (updates dimensions)
- **Drag from nodes list** to dimension folders

---

## Middle Panel: Focus

Active workspace for the node(s) you're working with.

### Tabbed Interface

- **Primary tab** — Main focused node
- **Additional tabs** — Related nodes opened from chat
- **Tab controls** — Close (×), reorder, switch

### Node Detail View

| Section | Content |
|---------|---------|
| **Header** | Title, node ID, trash icon |
| **Content** | Full markdown content with syntax highlighting |
| **Metadata** | Created, updated, type, link |
| **Dimensions** | Editable dimension tags |
| **Connections** | Incoming/outgoing edges |

### Content Rendering

- Markdown support
- `[NODE:id:"title"]` renders as clickable links
- Syntax highlighting for code blocks
- YouTube embeds (if link is YouTube URL)

---

## Right Panel: Helpers

AI conversation interface.

### Chat Interface

- **Message history** — User + assistant messages
- **Tool call visibility** — Collapsed by default, expandable
- **Token/cost tracking** — Per-message usage
- **Node references** — Auto-linked `[NODE:id:"title"]`

### Mode Toggle

```
┌──────────────────┐
│ ⚡ Easy │ 🔥 Hard │
└──────────────────┘
```

| Mode | Model | Use Case |
|------|-------|----------|
| **Easy** | GPT-5 Mini | Fast, everyday tasks |
| **Hard** | Claude Sonnet 4.5 | Deep reasoning, complex analysis |

Mode persists in localStorage. Switch mid-conversation seamlessly.

### Collapsible Panel

- **Toggle:** Cmd+\\ (Mac) / Ctrl+\\ (Windows)
- **Collapsed state:** 48px rail with expand button
- **State persists:** Remembers your preference

---

## Quick Add

Bottom of the Helpers panel. Three modes:

| Mode | Icon | Purpose |
|------|------|---------|
| **Link** | 🔗 | Paste URLs for auto-extraction |
| **Note** | 📄 | Quick note, no AI processing |
| **Chat** | 💬 | Paste conversations |

Auto-detects mode based on input (URLs trigger Link mode).

---

## Search (Cmd+K)

Global search modal with 4-tier relevance:

1. **Exact title match** — Highest priority
2. **Title substring** — High priority
3. **FTS content match** — Medium priority
4. **Semantic embedding** — Conceptual matches

**Features:**
- Type-ahead instant results
- Keyboard navigation (↑↓, Enter)
- Click or Enter to open in Focus panel

---

## Settings Panel

**Access:** Settings cog icon (top-right, green ring)

**Size:** 88vw × 90vh with glass effect

### Tabs (in order)

| Tab | Purpose |
|-----|---------|
| **Subscription** | Account status, usage, upgrade options |
| **API Keys** | Configure Anthropic/OpenAI/Tavily keys |
| **Workflows** | View, edit, create, delete workflows |
| **Tools** | View available agent tools |
| **Context** | Auto-context toggle, view hub nodes |
| **Map** | Knowledge graph visualization |
| **Database** | Full node table with filters/sorting |
| **Logs** | Activity feed (last 100 entries) |
| **Agents** | External agent (MCP) configuration |

---

## Map View

Visual graph of your knowledge network.

**Features:**
- Force-directed layout with pan/zoom
- Node size proportional to edge count
- Top 15 nodes labeled (title + dimensions)
- Click node to highlight connections
- Selection shows connected nodes in green

**Styling:**
- Cluster layout with golden angle spiral
- Transparent flat circles
- Green rings for selected/connected nodes

---

## Database View

Full table view of all nodes.

**Columns:**
- Node (title + ID)
- Dimensions (folder badges)
- Edges (count)
- Status (context hub indicator)
- Updated (timestamp)

**Features:**
- Search by title/content
- Filter by dimensions
- Sort by updated/edges/created
- Pagination

---

## Dimension Icons

Each dimension can have a custom Lucide icon.

**To set:**
1. Open Folder View → hover over dimension
2. Click edit (pencil) icon
3. Choose icon from 115 curated options
4. Icons persist in localStorage

---

## Node References

**Format:** `[NODE:id:"title"]`

**Rendering:**
- Clickable labels in chat messages
- Clickable labels in node content
- Hover shows preview tooltip
- Click opens in Focus panel

AI agents automatically use this format for all node mentions.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open search |
| `Cmd+\\` | Toggle chat panel |
| `Escape` | Close modals/overlays |

---

## Design System

### Colors

- **Background:** `#0a0a0a` (near black)
- **Panels:** Subtle gradients distinguishing left/middle/right
- **Accent:** Green (`#22c55e`) for actions, selections
- **Text:** White (primary), neutral-400 (secondary)

### Typography

- **Font:** Geist (monospace feel)
- **Sizes:** 11-14px for UI, larger for content

### Buttons

- **Primary:** White bg, black text
- **Secondary:** Transparent, border, white text
- **Toggle:** 28×28px, subtle border, icon only
