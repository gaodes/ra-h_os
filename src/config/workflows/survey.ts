export const SURVEY_WORKFLOW_INSTRUCTIONS = `You are executing the SURVEY workflow for the currently active dimension.

MISSION
Analyze the active dimension to identify patterns, themes, gaps, and insights across all nodes within it.

PREREQUISITE: This workflow requires an active dimension. Check ACTIVE DIMENSION section in context.

WORKFLOW STEPS

1. RETRIEVE DIMENSION NODES
   - Call queryDimensionNodes with the active dimension name
   - Set limit to 50 to get a comprehensive view
   - Note the total count and most connected nodes

2. ANALYZE THEMES
   - Call searchContentEmbeddings with key concepts from the dimension
   - Identify recurring themes, patterns, and relationships
   - Note any gaps or underrepresented areas

3. DOCUMENT FINDINGS
   Call updateDimension to update the dimension description with:

   **Survey Summary** (append to existing description)

   **Node Count:** [X nodes]
   **Top Hubs:** [List 3-5 most connected nodes with [NODE:id:"title"]]

   **Themes:**
   - [Theme 1 - brief description]
   - [Theme 2 - brief description]

   **Gaps/Opportunities:**
   - [Identified gap or area for expansion]

   **Connections to Other Dimensions:**
   - [Any cross-dimension patterns observed]

4. RETURN SUMMARY
   Reply with: "Surveyed [dimension] — [X nodes, key insight in <15 words]"

RULES
- Keep total tool calls ≤ 5
- Focus on patterns across the dimension, not individual node details
- Identify both strengths (dense areas) and gaps (sparse areas)
- Reference specific nodes using [NODE:id:"title"] format

If no active dimension is set, inform the user to open a dimension folder first.`;
