import { tool } from 'ai';
import { z } from 'zod';
import { WorkflowRegistry, BUNDLED_WORKFLOW_KEYS } from '@/services/workflows/registry';

export const listWorkflowsTool = tool({
  description: 'List all available workflows',
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const workflows = await WorkflowRegistry.getAllWorkflows();

      return {
        success: true,
        workflows: workflows.map(w => ({
          key: w.key,
          displayName: w.displayName,
          description: w.description,
          enabled: w.enabled,
          requiresFocusedNode: w.requiresFocusedNode,
          isBundled: BUNDLED_WORKFLOW_KEYS.has(w.key),
        })),
      };
    } catch (error) {
      console.error('listWorkflows error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list workflows',
      };
    }
  },
});
