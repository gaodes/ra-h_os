import { INTEGRATE_WORKFLOW_INSTRUCTIONS } from '@/config/workflows/integrate';
import type { WorkflowDefinition } from './types';
import { listUserWorkflows, loadUserWorkflow } from './workflowFileService';

// Bundled default workflows (always available as fallback)
const BUNDLED_WORKFLOWS: Record<string, WorkflowDefinition> = {
  'integrate': {
    id: 1,
    key: 'integrate',
    displayName: 'Integrate',
    description: 'Deep analysis and connection-building for focused node',
    instructions: INTEGRATE_WORKFLOW_INSTRUCTIONS,
    enabled: true,
    requiresFocusedNode: true,
    primaryActor: 'oracle',
    expectedOutcome: 'Focused node updated with insights; 3-5 high-value edges created',
  }
};

// Set of bundled workflow keys (for UI to know which can be "reset to default")
export const BUNDLED_WORKFLOW_KEYS = new Set(Object.keys(BUNDLED_WORKFLOWS));

function userWorkflowToDefinition(uw: ReturnType<typeof loadUserWorkflow>, id: number): WorkflowDefinition {
  if (!uw) throw new Error('Cannot convert null workflow');
  return {
    id,
    key: uw.key,
    displayName: uw.displayName,
    description: uw.description,
    instructions: uw.instructions,
    enabled: uw.enabled,
    requiresFocusedNode: uw.requiresFocusedNode,
    primaryActor: 'oracle',
    expectedOutcome: undefined,
  };
}

export class WorkflowRegistry {
  static async getWorkflowByKey(key: string): Promise<WorkflowDefinition | null> {
    // Try user file first
    const userWorkflow = loadUserWorkflow(key);
    if (userWorkflow) {
      return userWorkflowToDefinition(userWorkflow, BUNDLED_WORKFLOWS[key]?.id || 100);
    }

    // Fall back to bundled
    return BUNDLED_WORKFLOWS[key] || null;
  }

  static async getEnabledWorkflows(): Promise<WorkflowDefinition[]> {
    const all = await this.getAllWorkflows();
    return all.filter(w => w.enabled);
  }

  static async getAllWorkflows(): Promise<WorkflowDefinition[]> {
    // Start with bundled defaults
    const result: Record<string, WorkflowDefinition> = {};

    for (const [key, workflow] of Object.entries(BUNDLED_WORKFLOWS)) {
      result[key] = { ...workflow };
    }

    // Load user workflows (overwrite bundled if same key, add new ones)
    const userWorkflows = listUserWorkflows();
    let nextId = 100;

    for (const uw of userWorkflows) {
      const existingId = result[uw.key]?.id || nextId++;
      result[uw.key] = userWorkflowToDefinition(uw, existingId);
    }

    return Object.values(result);
  }

  // Check if a workflow key is a bundled default
  static isBundledWorkflow(key: string): boolean {
    return BUNDLED_WORKFLOW_KEYS.has(key);
  }
}
