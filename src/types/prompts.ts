/**
 * Types for Anthropic prompt caching
 * https://docs.claude.com/en/docs/build-with-claude/prompt-caching
 */

export type CacheControl = { type: 'ephemeral' };

export interface CacheableBlock {
  type: 'text';
  text: string;
  cache_control?: CacheControl;
}

export interface SystemPromptResult {
  blocks: CacheableBlock[];
  cacheHit: boolean;
}

export interface CacheStats {
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  savingsPercentage: number;
}
