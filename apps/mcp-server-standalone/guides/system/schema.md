---
name: Schema
description: Full database schema, tables, columns, query patterns.
immutable: true
---

# Database Schema

## Tables

### nodes
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Primary key, auto-increment |
| title | TEXT | Required |
| description | TEXT | AI-generated grounding context (~1 sentence) |
| notes | TEXT | User's notes/thoughts (not source content) |
| chunk | TEXT | Full verbatim source content |
| chunk_status | TEXT | 'pending', 'chunked', 'failed' |
| link | TEXT | External URL (only for nodes representing external content) |
| event_date | TEXT | When the content happened (ISO date) — distinct from created_at |
| metadata | TEXT | JSON blob (map_position, transcript_length, etc.) |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### edges
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Primary key |
| from_node_id | INTEGER | FK → nodes.id |
| to_node_id | INTEGER | FK → nodes.id |
| context | TEXT | JSON: `{ explanation, category, type, confidence, created_via }` |
| source | TEXT | 'user', 'ai_similarity', or helper name |
| explanation | TEXT | Human-readable reason for connection |
| created_at | TEXT | ISO timestamp |

### dimensions
| Column | Type | Notes |
|--------|------|-------|
| name | TEXT | Primary key |
| description | TEXT | Purpose description |
| icon | TEXT | Emoji or icon identifier for UI display |
| is_priority | INTEGER | 1 = priority dimension (auto-assigns to new nodes) |
| updated_at | TEXT | ISO timestamp |

### node_dimensions (junction)
| Column | Type |
|--------|------|
| node_id | INTEGER FK → nodes.id |
| dimension | TEXT (dimension name) |

### chunks (for semantic search)
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Primary key |
| node_id | INTEGER | FK → nodes.id |
| chunk_idx | INTEGER | Position in sequence |
| text | TEXT | Chunk content |
| created_at | TEXT | ISO timestamp |
| embedding_type | TEXT | Embedding model used |
| metadata | TEXT | JSON blob |

### voice_usage (daily tracking)
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Primary key |
| date | TEXT | ISO date (UNIQUE) |
| minutes_used | REAL | Minutes consumed |
| updated_at | TEXT | ISO timestamp |

### FTS Tables
- `chunks_fts` — full-text search on chunk text
- `nodes_fts` — full-text search on node title + notes

## Common Query Patterns

**Top connected nodes (hubs):**
```sql
SELECT n.id, n.title, n.description, COUNT(DISTINCT e.id) AS edge_count
FROM nodes n
LEFT JOIN edges e ON (e.from_node_id = n.id OR e.to_node_id = n.id)
GROUP BY n.id ORDER BY edge_count DESC LIMIT 5
```

**Nodes in a dimension:**
```sql
SELECT n.* FROM nodes n
JOIN node_dimensions nd ON n.id = nd.node_id
WHERE nd.dimension = ?
```

**Edges for a node (both directions):**
```sql
SELECT e.*, n1.title as from_title, n2.title as to_title
FROM edges e
JOIN nodes n1 ON e.from_node_id = n1.id
JOIN nodes n2 ON e.to_node_id = n2.id
WHERE e.from_node_id = ? OR e.to_node_id = ?
```

**Search source content (chunks):**
```sql
SELECT c.id, c.node_id, c.chunk_idx, c.text, n.title
FROM chunks c
JOIN nodes n ON c.node_id = n.id
WHERE c.text LIKE '%search term%' COLLATE NOCASE
ORDER BY c.chunk_idx ASC
LIMIT 10
```

**Use `rah_search_content` to search chunks by keyword, or `rah_sqlite_query` for any read operation not covered by structured tools.**
