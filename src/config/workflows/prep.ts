export const PREP_WORKFLOW_INSTRUCTIONS = `You are executing the PREP workflow for the currently focused node.

MISSION
Quick summary to help the user decide if this content is worth deeper engagement.

WORKFLOW STEPS

1. READ THE NODE
   - Call getNodesById for the focused node
   - Understand what this is and extract the core message

2. APPEND BRIEF
   Call updateNode ONCE with ONLY this section:

   ---
   ## Brief

   **What:** [One sentence - what is this?]

   **Gist:** [2-3 sentences - the core message or takeaway]

   **Why it matters:** [1-2 sentences - relevance or implications]

   CRITICAL: Send ONLY the new section. The tool appends automatically.

3. RETURN SUMMARY
   Reply with a one-line confirmation: "Prepped [title] - [gist in <10 words]"

RULES
- Keep total tool calls ≤ 3
- Call updateNode exactly once
- Be concise - this is a quick prep, not deep analysis`;
