import { INTEGRATE_WORKFLOW_INSTRUCTIONS } from '@/config/workflows/integrate';
import type { WorkflowDefinition } from './types';

export class WorkflowRegistry {
  private static readonly WORKFLOWS: Record<string, WorkflowDefinition> = {
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

  static async getWorkflowByKey(key: string): Promise<WorkflowDefinition | null> {
    return this.WORKFLOWS[key] || null;
  }

  static async getEnabledWorkflows(): Promise<WorkflowDefinition[]> {
    return Object.values(this.WORKFLOWS).filter(w => w.enabled);
  }

  static async getAllWorkflows(): Promise<WorkflowDefinition[]> {
    return Object.values(this.WORKFLOWS);
  }
}
