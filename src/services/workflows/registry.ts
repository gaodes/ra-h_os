import { INTEGRATE_WORKFLOW_INSTRUCTIONS } from '@/config/workflows/integrate';
import { PREP_WORKFLOW_INSTRUCTIONS } from '@/config/workflows/prep';
import { RESEARCH_WORKFLOW_INSTRUCTIONS } from '@/config/workflows/research';
import { CONNECT_WORKFLOW_INSTRUCTIONS } from '@/config/workflows/connect';
import { SURVEY_WORKFLOW_INSTRUCTIONS } from '@/config/workflows/survey';
import type { WorkflowDefinition } from './types';
import { listUserWorkflows, loadUserWorkflow } from './workflowFileService';

// Bundled default workflows (always available as fallback)
const BUNDLED_WORKFLOWS: Record<string, WorkflowDefinition> = {
  'prep': {
    id: 1,
    key: 'prep',
    displayName: 'Prep',
    description: 'Quick summary to decide if content is worth deeper engagement',
    instructions: PREP_WORKFLOW_INSTRUCTIONS,
    enabled: true,
    requiresFocusedNode: true,
    primaryActor: 'oracle',
    expectedOutcome: 'Brief section appended with what/gist/why it matters',
  },
  'research': {
    id: 2,
    key: 'research',
    displayName: 'Research',
    description: 'Background research on topic, person, or concept',
    instructions: RESEARCH_WORKFLOW_INSTRUCTIONS,
    enabled: true,
    requiresFocusedNode: true,
    primaryActor: 'oracle',
    expectedOutcome: 'Research notes appended with background and key findings',
  },
  'connect': {
    id: 3,
    key: 'connect',
    displayName: 'Connect',
    description: 'Find and create edges to related nodes',
    instructions: CONNECT_WORKFLOW_INSTRUCTIONS,
    enabled: true,
    requiresFocusedNode: true,
    primaryActor: 'oracle',
    expectedOutcome: '3-5 edges created to related nodes',
  },
  'integrate': {
    id: 4,
    key: 'integrate',
    displayName: 'Integrate',
    description: 'Full analysis, connection discovery, and documentation',
    instructions: INTEGRATE_WORKFLOW_INSTRUCTIONS,
    enabled: true,
    requiresFocusedNode: true,
    primaryActor: 'oracle',
    expectedOutcome: 'Integration analysis appended; 3-5 edges created',
  },
  'survey': {
    id: 5,
    key: 'survey',
    displayName: 'Survey',
    description: 'Analyze dimension patterns, themes, and gaps',
    instructions: SURVEY_WORKFLOW_INSTRUCTIONS,
    enabled: true,
    requiresFocusedNode: false, // Requires active dimension, not focused node
    primaryActor: 'oracle',
    expectedOutcome: 'Dimension description updated with survey findings',
  },
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
