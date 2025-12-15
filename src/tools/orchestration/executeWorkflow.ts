import { tool } from 'ai';
import { z } from 'zod';
import { WorkflowRegistry } from '@/services/workflows/registry';
import { getSQLiteClient } from '@/services/database/sqlite-client';
import { AgentDelegationService } from '@/services/agents/delegation';
import { WiseRAHExecutor } from '@/services/agents/wiseRAHExecutor';
import { RequestContext } from '@/services/context/requestContext';
import { getAutoContextSummaries } from '@/services/context/autoContext';

export const executeWorkflowTool = tool({
  description: 'Execute predefined workflow via wise ra-h',
  inputSchema: z.object({
    workflowKey: z.string().describe('Key of workflow to execute (e.g., "integrate")'),
    nodeId: z.number().describe('ID of node to run workflow on (usually focused node)'),
    userContext: z.string().optional().describe('Optional: Additional context or instructions from user'),
  }),
  execute: async ({ workflowKey, nodeId, userContext }) => {
    // 1. Fetch workflow definition
    const workflow = await WorkflowRegistry.getWorkflowByKey(workflowKey);
    if (!workflow) {
      return { success: false, error: `Workflow '${workflowKey}' not found` };
    }
    if (!workflow.enabled) {
      return { success: false, error: `Workflow '${workflowKey}' is disabled` };
    }

    // 2. Validate node requirement
    if (workflow.requiresFocusedNode && !nodeId) {
      return { success: false, error: `Workflow '${workflowKey}' requires a focused node` };
    }

    // 2.5. Prevent re-running same workflow on same node within 1 hour
    if (nodeId) {
      const db = getSQLiteClient();
      const recentRuns = db.query<{ id: number }>(
        `SELECT id FROM chats 
         WHERE json_extract(metadata, '$.workflow_key') = ? 
         AND json_extract(metadata, '$.workflow_node_id') = ?
         AND datetime(created_at) > datetime('now', '-1 hour')
         LIMIT 1`,
        [workflowKey, nodeId]
      ).rows;

      if (recentRuns.length > 0) {
        return { 
          success: false, 
          error: `Workflow '${workflowKey}' already ran on node ${nodeId} within the last hour. Check the node content - the Integration Analysis section should already be there.` 
        };
      }
    }

    // 3. Validate node exists and fetch full context (if node provided)
    let contextLines: string[] = [];
    if (nodeId) {
      const db = getSQLiteClient();
      const stmt = db.prepare('SELECT * FROM nodes WHERE id = ?');
      const node = stmt.get(nodeId) as any;
      if (!node) {
        return { success: false, error: `Node ${nodeId} not found` };
      }

      contextLines = [
        `Focused Node: [NODE:${node.id}:"${node.title}"]`,
        node.description ? `Description: ${node.description}` : null,
        node.content ? `Content: ${node.content}` : null,
        node.link ? `Link: ${node.link}` : null,
      ].filter(Boolean) as string[];
    }

    // Removed conflicting guardrail - wise-rah has updateNode access and should use it

    if (userContext) {
      contextLines.push(`User Context: ${userContext}`);
    }

    // 4. Build task with workflow instructions
    RequestContext.set({ workflowKey, workflowNodeId: nodeId });

    const autoContextSummaries = getAutoContextSummaries(6);
    if (autoContextSummaries.length > 0) {
      contextLines.push('Background Context (Top Hubs):');
      autoContextSummaries.forEach((summary) => {
        contextLines.push(
          `[NODE:${summary.id}:"${summary.title}"] (${summary.edgeCount} edges)`
        );
      });
    }

    const task = `Execute workflow: ${workflow.displayName}

${workflow.instructions}

${nodeId ? `Target Node ID: ${nodeId}` : 'No specific node targeted (general workflow)'}`;

    // 5. Delegate to wise ra-h oracle with workflow metadata
    const requestContext = RequestContext.get();
    console.log('[executeWorkflowTool] Current traceId:', requestContext.traceId);

    const delegation = AgentDelegationService.createDelegation({
      task,
      context: contextLines,
      expectedOutcome: workflow.expectedOutcome,
      agentType: 'wise-rah',
      supabaseToken: null,
    });

    // Fire-and-forget execution so main ra-h stays responsive while workflow runs
    void WiseRAHExecutor.execute({
      sessionId: delegation.sessionId,
      task,
      context: contextLines,
      expectedOutcome: workflow.expectedOutcome,
      traceId: requestContext.traceId,
      parentChatId: requestContext.parentChatId,
      workflowKey,
      workflowNodeId: nodeId,
    }).catch((error) => {
      console.error('[executeWorkflowTool] Wise ra-h delegation failed', error);
    });

    RequestContext.set({ workflowKey: undefined, workflowNodeId: undefined });

    const shortSessionId = delegation.sessionId.split('_').pop();
    const workflowLabel = workflow.displayName || workflowKey;
    return [
      `Delegated **${workflowLabel}** to wise ra-h (session ${shortSessionId}).`,
      'Keep working here—wise ra-h will stream every step inside its tab and post the final summary when complete.',
    ].join('\n');
  },
});
