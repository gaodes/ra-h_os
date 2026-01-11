import { tool } from 'ai';
import { z } from 'zod';
import { WorkflowRegistry } from '@/services/workflows/registry';
import { saveWorkflow, loadUserWorkflow } from '@/services/workflows/workflowFileService';

export const editWorkflowTool = tool({
  description: 'Update a workflow definition. Use to refine instructions, update description, or toggle enabled state.',
  inputSchema: z.object({
    workflowKey: z.string().describe('The key of the workflow to edit'),
    updates: z.object({
      displayName: z.string().optional().describe('New display name'),
      description: z.string().optional().describe('New description'),
      instructions: z.string().optional().describe('New instructions (full replacement)'),
      enabled: z.boolean().optional().describe('Enable or disable the workflow'),
      requiresFocusedNode: z.boolean().optional().describe('Whether workflow requires a focused node'),
    }).describe('Fields to update'),
  }),
  execute: async ({ workflowKey, updates }) => {
    try {
      // Get existing workflow (from user file or bundled default)
      const existing = await WorkflowRegistry.getWorkflowByKey(workflowKey);

      if (!existing) {
        return {
          success: false,
          error: `Workflow '${workflowKey}' not found`,
        };
      }

      // Merge updates with existing values
      const updated = {
        key: workflowKey,
        displayName: updates.displayName ?? existing.displayName,
        description: updates.description ?? existing.description,
        instructions: updates.instructions ?? existing.instructions,
        enabled: updates.enabled ?? existing.enabled,
        requiresFocusedNode: updates.requiresFocusedNode ?? existing.requiresFocusedNode,
      };

      // Save to user workflow file (this will override bundled if same key)
      saveWorkflow(updated);

      return {
        success: true,
        message: `Workflow '${workflowKey}' updated`,
        workflow: {
          key: updated.key,
          displayName: updated.displayName,
          description: updated.description,
          enabled: updated.enabled,
          requiresFocusedNode: updated.requiresFocusedNode,
        },
      };
    } catch (error) {
      console.error('editWorkflow error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to edit workflow',
      };
    }
  },
});
