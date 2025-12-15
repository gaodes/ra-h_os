export interface WorkflowDefinition {
  id: number;
  key: string;
  displayName: string;
  description: string;
  instructions: string;
  enabled: boolean;
  requiresFocusedNode: boolean;
  primaryActor: 'oracle' | 'main';
  expectedOutcome?: string;
}
