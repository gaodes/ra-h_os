import { getDefaultToolNamesForRole } from '@/tools/infrastructure/registry';
import { RAH_MAIN_SYSTEM_PROMPT } from '@/config/prompts/rah-main';
import { RAH_EASY_SYSTEM_PROMPT } from '@/config/prompts/rah-easy';
import { MINI_RAH_SYSTEM_PROMPT } from '@/config/prompts/rah-mini';
import { WISE_RAH_SYSTEM_PROMPT } from '@/config/prompts/wise-rah';
import type { AgentDefinition } from './types';

/**
 * Code-first agent registry (opinionated, not database-driven)
 * Agents are defined in code and cannot be modified by users
 */
export class AgentRegistry {
  // Deterministic agent definitions baked into code
  private static readonly AGENTS: Record<string, AgentDefinition> = {
    'ra-h': {
      id: 1,
      key: 'ra-h',
      displayName: 'ra-h (hard)',
      description: 'Opinionated orchestrator agent',
      model: 'anthropic/claude-sonnet-4.5',
      role: 'orchestrator',
      systemPrompt: RAH_MAIN_SYSTEM_PROMPT,
      availableTools: getDefaultToolNamesForRole('orchestrator'),
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      memory: null,
      prompts: undefined
    },
    'ra-h-easy': {
      id: 4,
      key: 'ra-h-easy',
      displayName: 'ra-h (easy)',
      description: 'Fast, low-latency orchestrator',
      model: 'openai/gpt-5-mini',
      role: 'orchestrator',
      systemPrompt: RAH_EASY_SYSTEM_PROMPT,
      availableTools: getDefaultToolNamesForRole('orchestrator'),
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      memory: null,
      prompts: undefined
    },
    'mini-rah': {
      id: 2,
      key: 'mini-rah',
      displayName: 'mini ra-h',
      description: 'Executor agent for delegated tasks',
      model: 'openai/gpt-4o-mini',
      role: 'executor',
      systemPrompt: MINI_RAH_SYSTEM_PROMPT,
      availableTools: getDefaultToolNamesForRole('executor'),
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      memory: null,
      prompts: undefined
    },
    'wise-rah': {
      id: 3,
      key: 'wise-rah',
      displayName: 'wise ra-h',
      description: 'Complex workflow planner and orchestrator',
      model: 'openai/gpt-5',
      role: 'planner',
      systemPrompt: WISE_RAH_SYSTEM_PROMPT,
      availableTools: getDefaultToolNamesForRole('planner'),
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      memory: null,
      prompts: undefined
    }
  };

  static async getAgentByKey(key: string): Promise<AgentDefinition | null> {
    return this.AGENTS[key] || null;
  }

  static async getAgentById(id: number): Promise<AgentDefinition | null> {
    return Object.values(this.AGENTS).find(a => a.id === id) || null;
  }

  static async getEnabledAgents(): Promise<AgentDefinition[]> {
    return Object.values(this.AGENTS).filter(a => a.enabled);
  }

  static async orchestrator(): Promise<AgentDefinition> {
    return this.AGENTS['ra-h'];
  }

  static async orchestratorForMode(mode: 'easy' | 'hard' = 'easy'): Promise<AgentDefinition> {
    if (mode === 'hard') {
      return this.AGENTS['ra-h'];
    }
    return this.AGENTS['ra-h-easy'];
  }

  static async executor(): Promise<AgentDefinition> {
    return this.AGENTS['mini-rah'];
  }

  static async planner(): Promise<AgentDefinition> {
    return this.AGENTS['wise-rah'];
  }
}
