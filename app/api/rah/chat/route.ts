import { NextRequest } from 'next/server';
import { streamText, convertToCoreMessages } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { getHelperTools, getDefaultToolNamesForRole } from '@/tools/infrastructure/registry';
import { buildSystemPromptBlocks } from '@/services/helpers/contextBuilder';
import { helperLogger } from '@/services/helpers/logger';
import { withChatLogging } from '@/services/chat/middleware';
import { AgentRegistry } from '@/services/agents/registry';
import { calculateCost } from '@/services/analytics/pricing';
import { UsageData } from '@/types/analytics';
import type { CacheStats } from '@/types/prompts';
import { randomUUID } from 'crypto';
import { RequestContext } from '@/services/context/requestContext';
import { isLocalMode } from '@/config/runtime';

export const maxDuration = 900; // 15 minutes (for workflows)

if (isLocalMode()) {
  // TODO: add any special local-mode setup if needed later
}

const ANTHROPIC_MODEL_MAP: Record<string, string> = {
  'claude-sonnet-4.5': 'claude-sonnet-4-5-20250929',
  'claude-3-5-sonnet': 'claude-3-5-sonnet-20241022',
};

type ApiKeyOverrides = {
  openai?: string;
  anthropic?: string;
};

function resolveModel(modelId: string, apiKeys?: ApiKeyOverrides) {
  if (modelId.startsWith('anthropic/')) {
    const rawName = modelId.split('/')[1];
    const mapped = ANTHROPIC_MODEL_MAP[rawName] || rawName;

    const orchestratorKey =
      apiKeys?.anthropic ||
      process.env.RAH_ORCHESTRATOR_ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_API_KEY;
    if (!orchestratorKey) {
      throw new Error('RAH_ORCHESTRATOR_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY) is not set.');
    }
    const provider = createAnthropic({
      apiKey: orchestratorKey,
      headers: {
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
    });
    return provider(mapped);
  }
  if (modelId.startsWith('openai/')) {
    const name = modelId.split('/')[1];

    const delegateKey =
      apiKeys?.openai ||
      process.env.RAH_DELEGATE_OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY;
    if (!delegateKey) {
      throw new Error('RAH_DELEGATE_OPENAI_API_KEY (or OPENAI_API_KEY) is not set.');
    }
    const provider = createOpenAI({ apiKey: delegateKey });
    return provider(name);
  }
  throw new Error(`Unsupported model id: ${modelId}`);
}

// Global cache stats storage for monitoring
declare global {
  // eslint-disable-next-line no-var
  var lastCacheStats: CacheStats | undefined;
}

type AnthropicUsageLike = {
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  cacheCreationInputTokens?: number;
  cachedInputTokens?: number;
  totalTokens?: number;
  cache_write_input_tokens?: number;
  cache_read_input_tokens?: number;
  cacheWriteInputTokens?: number;
  cacheReadInputTokens?: number;
};

function normaliseUsage(entry: AnthropicUsageLike | undefined | null) {
  if (!entry) {
    return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  }

  const toNumber = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const input = toNumber(entry.inputTokens ?? entry.promptTokens ?? (entry as any).input_tokens ?? 0);
  const output = toNumber(entry.outputTokens ?? entry.completionTokens ?? (entry as any).output_tokens ?? 0);
  const cacheWrite = toNumber(
    entry.cacheCreationInputTokens ??
    (entry as any).cache_creation_input_tokens ??
    entry.cacheWriteInputTokens ??
    entry.cache_write_input_tokens ??
    0
  );
  const cacheRead = toNumber(
    entry.cachedInputTokens ??
    entry.cacheReadInputTokens ??
    (entry as any).cache_read_input_tokens ??
    0
  );

  return { input, output, cacheWrite, cacheRead };
}

function aggregateAnthropicUsage(usage: AnthropicUsageLike | undefined, providerMetadata: any) {
  const totals = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };
  let dataSources = 0;

  const add = (entry: AnthropicUsageLike | undefined | null) => {
    if (!entry) return;
    const { input, output, cacheWrite, cacheRead } = normaliseUsage(entry);
    if (input || output || cacheWrite || cacheRead) {
      totals.inputTokens += input;
      totals.outputTokens += output;
      totals.cacheWriteTokens += cacheWrite;
      totals.cacheReadTokens += cacheRead;
      dataSources += 1;
    }
  };

  const anthropicMeta = providerMetadata?.anthropic;

  if (anthropicMeta) {
    if (Array.isArray(anthropicMeta.requests)) {
      anthropicMeta.requests.forEach((req: any) => {
        add(req?.usage ?? req);
      });
    }

    if (anthropicMeta.response?.usage) {
      add(anthropicMeta.response.usage);
    }

    if (anthropicMeta.usage && dataSources === 0) {
      add(anthropicMeta.usage);
    }
  }

  if (dataSources === 0) {
    add(usage);
  }

  // Fallback to usage totals if metadata did not provide cache info
  if (totals.cacheReadTokens === 0 && usage?.cachedInputTokens) {
    totals.cacheReadTokens = normaliseUsage(usage).cacheRead;
  }
  if (totals.cacheWriteTokens === 0 && usage?.cacheCreationInputTokens) {
    totals.cacheWriteTokens = normaliseUsage(usage).cacheWrite;
  }

  return totals;
}

export async function POST(request: NextRequest) {
  let helperKey = 'ra-h';
  try {
    const {
      messages = [],
      openTabs = [],
      activeTabId = null,
      currentView = 'nodes',
      sessionId,
      traceId,
      mode: requestedMode = 'easy',
      apiKeys: rawApiKeys
    } = await request.json();
    const apiKeys: ApiKeyOverrides | undefined = rawApiKeys
      ? {
          openai: typeof rawApiKeys.openai === 'string' && rawApiKeys.openai.trim().length > 0
            ? rawApiKeys.openai.trim()
            : undefined,
          anthropic: typeof rawApiKeys.anthropic === 'string' && rawApiKeys.anthropic.trim().length > 0
            ? rawApiKeys.anthropic.trim()
            : undefined,
        }
      : undefined;

    const mode: 'easy' | 'hard' = requestedMode === 'hard' ? 'hard' : 'easy';
    helperKey = mode === 'hard' ? 'ra-h' : 'ra-h-easy';

    const conversationTraceId = traceId || randomUUID();

    RequestContext.set({
      traceId: conversationTraceId,
      openTabs,
      activeTabId,
      mode,
      apiKeys,
    });

    // Filter messages to only valid roles
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sanitizedMessages = messages.filter((msg: any) =>
      msg && ['user', 'assistant', 'system'].includes(msg.role)
    );

    const helperConfig = await AgentRegistry.orchestratorForMode(mode);
    if (!helperConfig) {
      throw new Error(`No orchestrator definition found for mode '${mode}'`);
    }

    helperKey = helperConfig.key || helperKey;

    helperLogger.logUserMessage(helperKey, messages, openTabs, activeTabId);

    const { blocks: systemBlocks, cacheHit } = await buildSystemPromptBlocks(
      { nodes: openTabs, activeNodeId: activeTabId },
      helperKey
    );

    const systemPromptPreview = systemBlocks.map(b => b.text).join('\n').substring(0, 200) + '...';
    helperLogger.logSystemPrompt(helperKey, systemPromptPreview, cacheHit);
    
    console.log('🔧 [Prompt Caching] System blocks structure:', {
      helperKey,
      totalBlocks: systemBlocks.length,
      cachedBlocks: systemBlocks.filter(b => b.cache_control).length,
      blockLengths: systemBlocks.map((b, i) => ({
        index: i,
        length: b.text.length,
        cached: !!b.cache_control
      }))
    });

    const toolNames = helperConfig.availableTools?.length
      ? helperConfig.availableTools
      : getDefaultToolNamesForRole(helperConfig.role);
    const tools = getHelperTools(toolNames);
    const modelId = helperConfig.model || 'anthropic/claude-sonnet-4.5';
    const model = resolveModel(modelId, apiKeys);

    const rawModelId = modelId.split('/')[1] || modelId;
    const fullModelId = ANTHROPIC_MODEL_MAP[rawModelId] || rawModelId;

    const isAnthropicModel = modelId.startsWith('anthropic/');
    const isOpenAIModel = modelId.startsWith('openai/');

    const toolsUsedInSession: string[] = [];

    // Convert system blocks to messages with providerOptions for caching
    const systemMessages = systemBlocks.map((block) => ({
      role: 'system' as const,
      content: block.text,
      ...(isAnthropicModel && block.cache_control ? {
        providerOptions: {
          anthropic: { cacheControl: block.cache_control }
        }
      } : {})
    }));

    const coreMessages = convertToCoreMessages(sanitizedMessages);
    const allMessages = [...systemMessages, ...coreMessages];
    
    // Debug logging (can be removed in production)
    if (process.env.DEBUG_CACHE === 'true') {
      console.log('🔍 [Debug] System messages with cache control:');
      systemMessages.forEach((msg, i) => {
        console.log(`  Block ${i}:`, {
          hasContent: !!msg.content,
          contentLength: msg.content?.length || 0,
          hasProviderOptions: !!msg.providerOptions,
          cacheControl: msg.providerOptions?.anthropic?.cacheControl
        });
      });
    }

    const streamConfig = {
      model,
      messages: allMessages,
      tools,
      stopWhen: [],
      maxSteps: 10,
      ...(isOpenAIModel ? { reasoning: { effort: 'light' as const } } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onToolCall: ({ toolCall }: any) => {
        helperLogger.logToolCall(helperKey, toolCall.toolName, toolCall.args);
        if (!toolsUsedInSession.includes(toolCall.toolName)) {
          toolsUsedInSession.push(toolCall.toolName);
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onToolResult: ({ toolCall, result }: any) => {
        helperLogger.logToolResult(helperKey, toolCall.toolName, result);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onFinish: (result: any) => {
        helperLogger.logAssistantResponse(helperKey, result.text);
        
        // Debug logging (can be removed in production)
        if (process.env.DEBUG_CACHE === 'true') {
          console.log('🔍 [Debug] Full onFinish result keys:', Object.keys(result));
          console.log('🔍 [Debug] Raw usage object:', JSON.stringify(result.usage, null, 2));
          console.log('🔍 [Debug] Provider metadata:', JSON.stringify(result.providerMetadata, null, 2));
          console.log('🔍 [Debug] Steps array length:', result.steps?.length || 0);
          if (result.steps && result.steps.length > 0) {
            result.steps.forEach((step: any, i: number) => {
              console.log(`🔍 [Debug] Step ${i} usage:`, JSON.stringify(step.usage, null, 2));
              console.log(`🔍 [Debug] Step ${i} providerMetadata:`, JSON.stringify(step.providerMetadata, null, 2));
            });
          }
        }
        
        const aggregatedUsage = isAnthropicModel
          ? (() => {
              // Aggregate across ALL steps, not just final result
              const totals = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };
              
              if (result.steps && Array.isArray(result.steps)) {
                result.steps.forEach((step: any) => {
                  const stepUsage = aggregateAnthropicUsage(step.usage, step.providerMetadata);
                  totals.inputTokens += stepUsage.inputTokens;
                  totals.outputTokens += stepUsage.outputTokens;
                  // Cache write only happens once (in first step), so take MAX not SUM
                  totals.cacheWriteTokens = Math.max(totals.cacheWriteTokens, stepUsage.cacheWriteTokens);
                  totals.cacheReadTokens += stepUsage.cacheReadTokens;
                });
              } else {
                // Fallback to result-level usage if no steps
                const resultUsage = aggregateAnthropicUsage(result.usage, result.providerMetadata);
                totals.inputTokens = resultUsage.inputTokens;
                totals.outputTokens = resultUsage.outputTokens;
                totals.cacheWriteTokens = resultUsage.cacheWriteTokens;
                totals.cacheReadTokens = resultUsage.cacheReadTokens;
              }
              
              return totals;
            })()
          : {
              inputTokens: Number(result.usage?.inputTokens ?? result.usage?.promptTokens ?? 0),
              outputTokens: Number(result.usage?.outputTokens ?? result.usage?.completionTokens ?? 0),
              cacheWriteTokens: 0,
              cacheReadTokens: 0,
            };

        const regular = aggregatedUsage.inputTokens || 0;
        const cacheWrite = aggregatedUsage.cacheWriteTokens || 0;
        const cacheRead = aggregatedUsage.cacheReadTokens || 0;
        const outputTokens = aggregatedUsage.outputTokens || 0;
        const total = regular + cacheWrite + cacheRead;

        if (regular || cacheWrite || cacheRead || outputTokens) {
          const savingsPercentage = total > 0 && cacheRead > 0 ? Math.round((cacheRead / total) * 100) : 0;

          if (isAnthropicModel) {
            const cacheStats: CacheStats = {
              cacheCreationInputTokens: cacheWrite,
              cacheReadInputTokens: cacheRead,
              inputTokens: regular,
              outputTokens,
              savingsPercentage
            };

            console.log('\n📦 ═══════════════════════════════════════');
            console.log('📦  ANTHROPIC PROMPT CACHE STATISTICS');
            console.log('📦 ═══════════════════════════════════════');
            console.log(`📦  Cache Write: ${cacheWrite.toLocaleString()} tokens ${cacheWrite > 0 ? '(NEW CACHE CREATED ✨)' : ''}`);
            console.log(`📦  Cache Read:  ${cacheRead.toLocaleString()} tokens ${cacheRead > 0 ? '(CACHE HIT 🎯)' : '(CACHE MISS ❌)'}`);
            console.log(`📦  Regular:     ${regular.toLocaleString()} tokens`);
            console.log(`📦  Total Input: ${total.toLocaleString()} tokens`);
            console.log(`📦  Output:      ${cacheStats.outputTokens.toLocaleString()} tokens`);
            if (cacheRead > 0) {
              const costSavings = Math.round(((cacheWrite * 1.25 + regular * 1.0 + cacheRead * 0.1) / (total * 1.0)) * 100);
              console.log(`📦  💰 Savings:  ${savingsPercentage}% tokens, ~${100 - costSavings}% cost`);
            }
            console.log('📦 ═══════════════════════════════════════\n');

            global.lastCacheStats = cacheStats;
          }

          const costResult = calculateCost({
            inputTokens: regular,
            outputTokens,
            cacheWriteTokens: cacheWrite,
            cacheReadTokens: cacheRead,
            modelId: fullModelId,
          });

          usageData = {
            inputTokens: regular,
            outputTokens,
            totalTokens: costResult.totalTokens,
            cacheWriteTokens: cacheWrite,
            cacheReadTokens: cacheRead,
            cacheHit: cacheRead > 0,
            cacheSavingsPct: savingsPercentage,
            estimatedCostUsd: costResult.totalCostUsd,
            modelUsed: fullModelId,
            provider: isAnthropicModel ? 'anthropic' : 'openai',
            toolsUsed: toolsUsedInSession.length > 0 ? toolsUsedInSession : undefined,
            toolCallsCount: toolsUsedInSession.length > 0 ? toolsUsedInSession.length : undefined,
            traceId: conversationTraceId,
            workflowKey: currentContext.workflowKey,
            workflowNodeId: currentContext.workflowNodeId,
            mode,
          };
        }
      }
    };

    let usageData: UsageData | undefined;

    const systemMessageText = systemBlocks.map(b => b.text).join('\n\n');
    const currentContext = RequestContext.get();

    const chatMetadata = {
      helperName: helperKey,
      openTabs,
      activeTabId,
      currentView,
      sessionId: sessionId || `session_${Date.now()}`,
      agentType: 'orchestrator' as const,
      traceId: conversationTraceId,
      mode,
      modelUsed: fullModelId,
      systemMessage: systemMessageText,
      workflowKey: currentContext.workflowKey,
      workflowNodeId: currentContext.workflowNodeId,
      get usageData() {
        return usageData;
      },
    };

    const result = await streamText(withChatLogging(streamConfig, chatMetadata, messages));

    return result.toUIMessageStreamResponse();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error(`❌ [${helperKey}] Route error:`, {
      error: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString()
    });

    helperLogger.logError(helperKey, error instanceof Error ? error : String(error));
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: 'Check server logs for full error details'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
