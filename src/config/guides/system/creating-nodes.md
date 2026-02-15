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
- Check priority dimensions — assign these when relevant
- If no existing dimension fits, create a new one (but prefer existing)

## Description Field

The description is the most important field for AI context. It powers search (5x boost),
appears in system prompts, and determines how agents understand the node.

**Standard:** State WHAT this is + WHY it matters. Extremely concise, high-level. Max 280 characters.

**Rules:**
- NO weak verbs: "discusses", "explores", "examines", "talks about"
- State the actual claim, insight, or purpose directly
- Include significance or implication in 1 phrase
- If auto-generated (omitted), the system will generate one — but agent-written descriptions are always better

**Good:** "By Karpathy — Software is becoming fluid: agents can rip functionality from repos instead of taking dependencies."
**Bad:** "This article discusses the importance of software becoming more fluid."
