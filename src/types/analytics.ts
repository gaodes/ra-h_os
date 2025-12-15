export interface UsageData {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  cacheHit?: boolean;
  cacheSavingsPct?: number;
  estimatedCostUsd: number;
  modelUsed: string;
  provider: 'anthropic' | 'openai';
  toolsUsed?: string[];
  toolCallsCount?: number;
  traceId?: string;
  parentChatId?: number;
  workflowKey?: string;
  workflowNodeId?: number;
  capsuleVersion?: number;
  contextSourcesUsed?: number[];
  validationStatus?: 'ok' | 'failed';
  validationMessage?: string;
  fallbackAction?: string;
  mode?: 'easy' | 'hard';
}

export interface EnhancedChatMetadata {
  timestamp: string;
  session_id: string;
  current_view: 'nodes' | 'memory';
  open_tab_count: number;
  has_focused_node: boolean;
  message_count: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cache_write_tokens?: number;
  cache_read_tokens?: number;
  cache_hit?: boolean;
  cache_savings_pct?: number;
  estimated_cost_usd?: number;
  model_used?: string;
  provider?: 'anthropic' | 'openai';
  tools_used?: string[];
  tool_calls_count?: number;
  trace_id?: string;
  parent_chat_id?: number;
  voice_tts_chars?: number;
  voice_tts_cost_usd?: number;
  voice_tts_chars_total?: number;
  voice_tts_cost_usd_total?: number;
  voice_request_id?: string;
  voice_tts_request_count?: number;
  voice_usage?: Array<{
    request_id: string;
    message_id?: string | null;
    chars: number;
    cost_usd: number;
    voice?: string;
    model?: string;
    duration_ms?: number | null;
    logged_at?: string;
  }>;
}

export interface CostReport {
  periodStart: string;
  periodEnd: string;
  totalCostUsd: number;
  totalChats: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheHitRate: number;
  cacheSavingsUsd: number;
  avgCostPerChat: number;
  avgTokensPerChat: number;
  costByAgent: {
    [agentName: string]: {
      costUsd: number;
      chats: number;
      tokens: number;
    };
  };
  costByModel: {
    [modelId: string]: {
      costUsd: number;
      chats: number;
      tokens: number;
    };
  };
}

export interface TraceCostSummary {
  traceId: string;
  totalCostUsd: number;
  chatCount: number;
  orchestratorCost: number;
  executorCost: number;
  plannerCost: number;
  totalTokens: number;
  interactions: Array<{
    chatId: number;
    agentName: string;
    costUsd: number;
    tokens: number;
    createdAt: string;
  }>;
}

export interface ModelPricing {
  provider: 'anthropic' | 'openai';
  inputPer1M: number;
  outputPer1M: number;
  cacheWritePer1M?: number;
  cacheReadPer1M?: number;
}

export interface CacheEffectiveness {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  totalCacheSavingsUsd: number;
  avgSavingsPerHit: number;
  totalTokensSaved: number;
}
