import { tool } from 'ai';
import { z } from 'zod';
import { AgentDelegationService } from '@/services/agents/delegation';
import { WiseRAHExecutor } from '@/services/agents/wiseRAHExecutor';
import { RequestContext } from '@/services/context/requestContext';

export const delegateToWiseRAHTool = tool({
  description: 'Delegate complex workflows to wise ra-h (GPT-5)',
  inputSchema: z.object({
    task: z.string().describe('Complex workflow description: what needs to be planned and executed'),
    context: z.array(z.string()).max(8).default([]).describe('Optional context: node IDs, URLs, or key information the planner needs'),
    expectedOutcome: z.string().optional().describe('Optional: what final result or format you expect in the summary'),
    workflowKey: z.string().optional().describe('Optional: workflow key if invoked via executeWorkflow'),
    workflowNodeId: z.number().optional().describe('Optional: target node ID for workflow'),
  }),
  execute: async ({ task, context = [], expectedOutcome, workflowKey, workflowNodeId }) => {
    const requestContext = RequestContext.get();
    console.log('[delegateToWiseRAH] Current traceId:', requestContext.traceId);

    const delegation = AgentDelegationService.createDelegation({
      task,
      context,
      expectedOutcome,
      agentType: 'wise-rah',
      supabaseToken: null,
    });

    const execution = await WiseRAHExecutor.execute({
      sessionId: delegation.sessionId,
      task,
      context,
      expectedOutcome,
      traceId: requestContext.traceId,
      parentChatId: requestContext.parentChatId,
      workflowKey,
      workflowNodeId,
    });

    // Return a simple string that Claude can directly use in conversation
    const summary = execution?.summary || 'Wise ra-h delegated but no summary returned.';
    return `Wise ra-h (session ${delegation.sessionId.split('_').pop()}) completed the workflow:\n\n${summary}`;
  },
});
