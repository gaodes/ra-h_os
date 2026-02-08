---
name: Dimensions
description: Create, lock, describe, organize, clean up dimensions.
immutable: true
---

# Dimensions

Dimensions are how nodes are categorized and organized. Think of them as flexible tags with descriptions.

## Operations

- **Create:** `createDimension(name, description, isPriority)`
- **Update:** `updateDimension(name, { newName, description, isPriority })`
- **Delete:** `deleteDimension(name)` — removes from all nodes
- **Query:** Use sqliteQuery to list dimensions and their node counts

## Locking (Priority)

- `isPriority = true` (locked) → dimension auto-assigns to new nodes when relevant
- `isPriority = false` (unlocked) → manual assignment only
- Lock dimensions that represent active areas of focus

## Naming Conventions

- Lowercase, concise (e.g., "ai", "philosophy", "ra-h")
- Use singular form where natural
- Avoid overlapping names (don't have both "ai" and "artificial-intelligence")

## Description

Every dimension should have a description explaining its purpose. This helps the AI correctly assign nodes to dimensions.

## Cleanup

- Delete dimensions with 0 nodes
- Merge overlapping dimensions (update nodes, then delete the redundant one)
- Regularly review dimension list for coherence
