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
| content | TEXT | User's notes/thoughts (not source content) |
| chunk | TEXT | Full verbatim source content |
| chunk_status | TEXT | 'pending', 'chunked', 'failed' |
| link | TEXT | External URL (only for nodes representing external content) |
| type | TEXT | Nullable (reserved for future use) |
| metadata | TEXT | JSON blob (map_position, transcript_length, etc.) |
| is_pinned | INTEGER | Legacy — use hub node queries instead |
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
| id | INTEGER | Primary key |
| name | TEXT | Unique, case-insensitive |
| description | TEXT | Purpose description |
| is_locked | INTEGER | 1 = priority dimension (auto-assigns to new nodes) |

### node_dimensions (junction)
| Column | Type |
|--------|------|
| node_id | INTEGER FK → nodes.id |
| dimension_id | INTEGER FK → dimensions.id |

### chunks (for semantic search)
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Primary key |
| node_id | INTEGER | FK → nodes.id |
| chunk_index | INTEGER | Position in sequence |
| text | TEXT | Chunk content |
| embedding | BLOB | Vector (via sqlite-vec) |

### FTS Tables
- `chunks_fts` — full-text search on chunk text
- `nodes_fts` — full-text search on node title + content

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
JOIN dimensions d ON nd.dimension_id = d.id
WHERE d.name = ?
```

**Edges for a node (both directions):**
```sql
SELECT e.*, n1.title as from_title, n2.title as to_title
FROM edges e
JOIN nodes n1 ON e.from_node_id = n1.id
JOIN nodes n2 ON e.to_node_id = n2.id
WHERE e.from_node_id = ? OR e.to_node_id = ?
```

**Use sqliteQuery for any read operation not covered by structured tools.**
