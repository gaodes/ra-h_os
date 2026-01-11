export const CONNECT_WORKFLOW_INSTRUCTIONS = `You are executing the CONNECT workflow for the currently focused node.

MISSION
Quick link: find explicitly related nodes and create edges. Fast text search only - no slow embedding search.

WORKFLOW STEPS

1. READ NODE
   Call getNodesById for the focused node. Note the title, type, and key names/entities mentioned.

2. QUICK SEARCH
   Call queryNodes ONCE with the most specific entity (person name, project name, company, tool).
   - Use search parameter with the exact name
   - Set limit: 10

   DO NOT call searchContentEmbeddings - use queryNodes only for speed.

3. CREATE EDGES
   From the search results, pick 2-4 nodes that are clearly related.
   Call createEdge for each:
   - from_node_id: focused node ID
   - to_node_id: related node ID
   - context: { explanation: "brief reason" }

4. DONE
   Reply: "Linked [title] → [list of connected node titles]"

RULES
- Total tool calls ≤ 5 (1 read + 1 search + up to 3 edges)
- Use queryNodes only - NO searchContentEmbeddings
- Only link nodes with clear, explicit relationships
- Skip if no good matches found`;
