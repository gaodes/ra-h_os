export const RESEARCH_WORKFLOW_INSTRUCTIONS = `You are executing the RESEARCH workflow for the currently focused node.

MISSION
Conduct background research on the topic/person/concept and append findings to the node.

WORKFLOW STEPS

1. READ & IDENTIFY
   - Call getNodesById for the focused node
   - Identify: what needs researching? (person's background, concept origins, recent developments, etc.)

2. WEB RESEARCH
   - Call webSearch with targeted queries (1-2 searches)
   - Focus on: background context, recent news, authoritative sources
   - Extract the most relevant findings

3. APPEND RESEARCH
   Call updateNode ONCE with ONLY this section:

   ---
   ## Research Notes

   **Background:** [2-3 sentences of context]

   **Key Findings:**
   - [Finding 1]
   - [Finding 2]
   - [Finding 3]

   **Sources:** [Brief attribution]

   CRITICAL: Send ONLY the new section. The tool appends automatically.

4. RETURN SUMMARY
   Reply with: "Researched [topic] - [key insight in <15 words]"

RULES
- Keep total tool calls ≤ 5
- Call updateNode exactly once
- Focus on factual background, not opinion
- Cite sources when possible`;
