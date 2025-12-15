import { tool } from 'ai';
import { z } from 'zod';
import { delegateToMiniRAHTool } from './delegateToMiniRAH';

export const delegateNodeQuotesTool = tool({
  description: 'Extract quotes from single node',
  inputSchema: z.object({
    nodeId: z.number().int().positive().describe('The node to read from'),
    question: z.string().min(3).describe('The question or prompt the quotes should answer'),
    maxQuotes: z.number().int().min(1).max(6).default(3).describe('Maximum number of quotes to return'),
    requireSummary: z.boolean().default(false).describe('Whether to include a short synthesis after the quotes'),
  }),
  execute: async ({ nodeId, question, maxQuotes, requireSummary }) => {
    const task = `Extract up to ${maxQuotes} ready-to-use verbatim quotes (include speaker/source if present) from [NODE:${nodeId}] that answer: "${question}". Provide each quote with a one-line takeaway.`;
    const context = [String(nodeId), `REQUIRE_SYNTHESIS:${requireSummary ? 'yes' : 'no'}`];
    const expectedOutcome = requireSummary
      ? 'Use the required Task/Actions/Result/Node/Context sources used/Follow-up template. In the Result line, list the quotes (prefixed with takeaways) first, then add a 2-3 sentence comparison summary. Always finish with "Context sources used" listing every NODE ID referenced.'
      : 'Use the required Task/Actions/Result/Node/Context sources used/Follow-up template. In the Result line, list only the quotes (each prefixed with a takeaway) and end the summary with "Context sources used" covering every NODE ID referenced.';

    if (typeof delegateToMiniRAHTool.execute !== 'function') {
      throw new Error('delegateToMiniRAH tool is unavailable.');
    }

    return delegateToMiniRAHTool.execute({
      task,
      context,
      expectedOutcome,
    }, undefined as any);
  }
});

export const delegateNodeComparisonTool = tool({
  description: 'Create synthesis from gathered evidence',
  inputSchema: z.object({
    title: z.string().min(3).describe('Title for the synthesis node'),
    comparisonPrompt: z.string().min(5).describe('Short description of what to compare or conclude'),
    sourceNodeIds: z.array(z.number().int().positive()).min(1).max(8).describe('Source nodes that must be cited'),
    includeOutline: z.boolean().default(false).describe('If true, worker should draft with numbered sections matching current outline in context'),
  }),
  execute: async ({ title, comparisonPrompt, sourceNodeIds, includeOutline }) => {
    const task = `Using the gathered evidence, draft the final synthesis titled "${title}". Compare or conclude on: ${comparisonPrompt}.`;
    const outlineHint = includeOutline
      ? 'Follow the outline provided in the context exactly (use the same headings).'
      : 'Structure the answer with clear sections (Intro, Comparison, Takeaways).';
    const contextEntries = sourceNodeIds.map(id => String(id));
    contextEntries.push(outlineHint);

    const expectedOutcome = 'Use the required Task/Actions/Result/Node/Context sources used/Follow-up template. In the Result line, deliver polished prose ready for createNode/updateNode, cite specific quotes inline where relevant, and finish with "Context sources used" listing every NODE ID you relied on.';

    if (typeof delegateToMiniRAHTool.execute !== 'function') {
      throw new Error('delegateToMiniRAH tool is unavailable.');
    }

    return delegateToMiniRAHTool.execute({
      task,
      context: contextEntries,
      expectedOutcome,
    }, undefined as any);
  }
});
