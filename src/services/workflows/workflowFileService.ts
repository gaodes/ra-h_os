import fs from 'fs';
import os from 'os';
import path from 'path';

export interface UserWorkflow {
  key: string;
  displayName: string;
  description: string;
  instructions: string;
  enabled: boolean;
  requiresFocusedNode: boolean;
}

function resolveBaseConfigDir(): string {
  const override = process.env.RAH_CONFIG_DIR;
  if (override && override.trim().length > 0) {
    return override;
  }

  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'RA-H');
  }

  if (process.platform === 'win32') {
    const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(roaming, 'RA-H');
  }

  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(xdgConfig, 'ra-h');
}

export function getWorkflowsDir(): string {
  return path.join(resolveBaseConfigDir(), 'workflows');
}

function ensureWorkflowsDirExists(): void {
  const dir = getWorkflowsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function listUserWorkflows(): UserWorkflow[] {
  const dir = getWorkflowsDir();
  if (!fs.existsSync(dir)) {
    return [];
  }

  const workflows: UserWorkflow[] = [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const filePath = path.join(dir, file);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);

      // Validate required fields
      if (parsed.key && parsed.displayName && parsed.instructions) {
        workflows.push({
          key: parsed.key,
          displayName: parsed.displayName,
          description: parsed.description || '',
          instructions: parsed.instructions,
          enabled: parsed.enabled !== false,
          requiresFocusedNode: parsed.requiresFocusedNode !== false,
        });
      }
    } catch (error) {
      console.warn(`Failed to load workflow file ${file}:`, error);
    }
  }

  return workflows;
}

export function loadUserWorkflow(key: string): UserWorkflow | null {
  const filePath = path.join(getWorkflowsDir(), `${key}.json`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    if (!parsed.key || !parsed.displayName || !parsed.instructions) {
      console.warn(`Invalid workflow file for key ${key}`);
      return null;
    }

    return {
      key: parsed.key,
      displayName: parsed.displayName,
      description: parsed.description || '',
      instructions: parsed.instructions,
      enabled: parsed.enabled !== false,
      requiresFocusedNode: parsed.requiresFocusedNode !== false,
    };
  } catch (error) {
    console.warn(`Failed to load workflow ${key}:`, error);
    return null;
  }
}

export function saveWorkflow(workflow: UserWorkflow): void {
  ensureWorkflowsDirExists();

  const filePath = path.join(getWorkflowsDir(), `${workflow.key}.json`);
  const data = {
    key: workflow.key,
    displayName: workflow.displayName,
    description: workflow.description,
    instructions: workflow.instructions,
    enabled: workflow.enabled,
    requiresFocusedNode: workflow.requiresFocusedNode,
  };

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function deleteWorkflow(key: string): boolean {
  const filePath = path.join(getWorkflowsDir(), `${key}.json`);

  if (!fs.existsSync(filePath)) {
    return false;
  }

  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    console.warn(`Failed to delete workflow ${key}:`, error);
    return false;
  }
}

export function userWorkflowExists(key: string): boolean {
  const filePath = path.join(getWorkflowsDir(), `${key}.json`);
  return fs.existsSync(filePath);
}
