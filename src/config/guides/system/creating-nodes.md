---
name: Creating Nodes
description: When and how to create nodes. Link field rules. Synthesis patterns.
immutable: true
---

# Creating Nodes

## When to Create

- User explicitly asks to save/capture something
- Extracting insights from existing content (synthesis)
- Ingesting external content (YouTube, website, PDF)

## Link Field Rules

- **Has link:** Node directly represents external content (YouTube video, website, PDF, article)
- **No link:** Node is derived/synthesized from existing content (ideas, insights, summaries, questions)
- Never add a link to synthesis or idea nodes

## Synthesis Pattern

When creating a node derived from existing content:
1. Create the node WITHOUT a link field
2. Call `createEdge` to connect it to ALL source nodes
3. Each edge needs an explanation ("Insight extracted from...", "Synthesized from...")

## Dimension Assignment

- New nodes should be assigned to relevant existing dimensions
- Check locked/priority dimensions — these auto-assign
- If no existing dimension fits, create a new one (but prefer existing)

## Description Field

- AI auto-generates a ~1 sentence description after creation
- Description is used for embeddings and search ranking (5x boost)
- Format: what is this node about, in plain language
