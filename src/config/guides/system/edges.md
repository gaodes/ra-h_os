---
name: Edges
description: Edge philosophy. Explanations, direction, types. Connection patterns.
immutable: true
---

# Edges

## Philosophy

Edges are the most valuable part of the knowledge graph. Individual nodes are useful; the web of connections between them is what makes the graph powerful.

## Rules

1. **Every edge needs an explanation** — why does this connection exist? Be specific.
2. **Direction matters** — FROM → TO should read like a sentence
3. **Types are inferred** — the system infers category/type from your explanation. Don't set types manually.

## Direction Convention

Write the explanation so FROM → TO reads naturally:
- Episode → Podcast: "Episode of this podcast"
- Book → Author: "Written by this author"
- Insight → Source: "Extracted from this source"
- Idea → Related idea: "Builds on this concept"

## Edge Context JSON

```json
{
  "explanation": "Human-readable reason",
  "category": "inferred (created_by, features, part_of, source_of, related_to)",
  "type": "inferred specific type",
  "confidence": 0.0-1.0,
  "created_via": "chat|mcp|workflow"
}
```

## Hub Traversal

Hub nodes (most-connected) are the user's core themes. To understand context around a topic:
1. Find the relevant hub node
2. Use `queryEdge` or sqliteQuery to get its connections
3. Traverse outward to related nodes

## When to Create Edges

- After creating synthesis/idea nodes (connect to sources)
- When user mentions a relationship between topics
- When running the Connect or Integrate guides
- When obvious connections exist that aren't captured
