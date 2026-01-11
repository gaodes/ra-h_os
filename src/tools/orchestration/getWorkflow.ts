import { tool } from 'ai';
import { z } from 'zod';
import { WorkflowRegistry, BUNDLED_WORKFLOW_KEYS } from '@/services/workflows/registry';
import { userWorkflowExists } from '@/services/workflows/workflowFileService';

export const getWorkflowTool = tool({
  description: 'Retrieve a workflow definition including its full instructions',
  inputSchema: z.object({
    workflowKey: z.string().describe('The key of the workflow to retrieve (e.g., "integrate", "prep")'),
  }),
  execute: async ({ workflowKey }) => {
    try {
      const workflow = await WorkflowRegistry.getWorkflowByKey(workflowKey);

      if (!workflow) {
        return {
          success: false,
          error: `Workflow '${workflowKey}' not found`,
        };
      }

      return {
        success: true,
        workflow: {
          key: workflow.key,
          displayName: workflow.displayName,
          description: workflow.description,
          instructions: workflow.instructions,
          enabled: workflow.enabled,
          requiresFocusedNode: workflow.requiresFocusedNode,
          isBundled: BUNDLED_WORKFLOW_KEYS.has(workflow.key),
          hasUserOverride: userWorkflowExists(workflow.key),
        },
      };
    } catch (error) {
      console.error('getWorkflow error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get workflow',
      };
    }
  },
});
