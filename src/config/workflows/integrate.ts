export const INTEGRATE_WORKFLOW_INSTRUCTIONS = `You are executing the INTEGRATE workflow for the currently focused node.

MISSION
Find meaningful connections across the user's knowledge graph and append an Integration Analysis to the node.

YOU HAVE DIRECT WRITE ACCESS via updateNode. The tool automatically appends – you cannot overwrite existing content.

WORKFLOW STEPS

0. PLAN (MANDATORY)
   - Call think to outline your approach for steps 1–4
   - Focus on what entities/concepts to extract and how to search for them

1. RETRIEVE & GROUND THE NODE
   - Call getNodesById for the focused node
   - Identify what type of thing this is (person, project, paper, idea, video, tweet, technique, etc.)
   - Extract key entities: specific names, projects, concepts, techniques mentioned
   - Summarize the core insight in one sentence

2. SEARCH THE DATABASE FOR CONNECTIONS
   DO NOT reference pinned context yet. Search the ENTIRE database:
   
   a) Obvious structural connections:
      - If names mentioned → queryNodes to find existing nodes about those people
      - If projects mentioned → queryNodes to find those project nodes
      - If specific techniques/tools mentioned → search for those exact terms
   
   b) Thematic connections:
      - Use searchContentEmbeddings with key concepts from step 1
      - Look for shared themes, complementary ideas, contradictions
      - Prefer nodes with high-signal relevance over weak matches
   
   - Aim for 3–8 strong connections, not 20 weak ones
   - Check existing edges with queryEdge to avoid duplicating connections

3. CONTEXTUALIZE WITH PINNED NODES
   NOW review the supplied PINNED CONTEXT:
   - Why might this node matter given the user's focus areas?
   - Does it advance any themes visible in pinned nodes?
   - Keep this brief – 1–2 sentences maximum

4. APPEND INTEGRATION ANALYSIS
   Call updateNode ONCE with ONLY the new section (do NOT include existing content):
   
   ---
   ## Integration Analysis
   
   [2–3 sentences: what this node is, why it matters, core insight]
   
   **Database Connections:**
   - [NODE:123:"Title"] — [why: authorship/shared concept/dependency/contradiction]
   - [NODE:456:"Title"] — [why: ...]
   - [continue for 3–8 connections found in step 2]
   
   **Relevance:** [1–2 sentences connecting to user's pinned context themes]
   
   CRITICAL: Send ONLY this new section. The tool will automatically append it to existing content.
   
   After ONE successful updateNode call, IMMEDIATELY move to step 5. Do NOT call updateNode again.

5. RETURN SUMMARY
   Reply with: Task / Actions / Result / Nodes / Follow-up (≤120 words)

CRITICAL RULES
- Search the FULL database, not just pinned nodes
- Use entities from step 1 to guide searches in step 2
- Call updateNode EXACTLY ONCE - after success, move to step 5 immediately
- Keep total tool calls ≤ 18 (be efficient)
- Adapt to any node type – don't assume it's always a paper or video

The goal: integrate this node into the knowledge graph through meaningful, database-wide connections.`;
