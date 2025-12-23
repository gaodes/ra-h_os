import { generateText, CoreMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { AgentDelegationService, DelegationStatus } from '@/services/agents/delegation';
import { MINI_RAH_SYSTEM_PROMPT } from '@/config/prompts/rah-mini';
import { getToolsForRole } from '@/tools/infrastructure/registry';
import { ChatLoggingMiddleware } from '@/services/chat/middleware';
import { calculateCost } from '@/services/analytics/pricing';
import { UsageData } from '@/types/analytics';
import { summarizeToolExecution } from '@/services/agents/toolResultUtils';
import { edgeService } from '@/services/database/edges';

interface CapsuleNodeJSON {
  id: number;
}

interface DelegationCapsuleJSON {
  version?: number;
  primary?: CapsuleNodeJSON | null;
  secondary?: CapsuleNodeJSON[];
  referenced?: CapsuleNodeJSON[];
}

interface SummaryValidation {
  status: 'ok' | 'failed';
  reason?: string;
  sourcesUsed: number[];
}

function extractCapsuleFromContext(context: string[]): { capsule?: DelegationCapsuleJSON; nodeIds: number[]; version?: number } {
  const entry = context.find(item => typeof item === 'string' && item.startsWith('CAPSULE_JSON::'));
  if (!entry) {
    return { nodeIds: [] };
  }
  const json = entry.substring('CAPSULE_JSON::'.length);
  try {
    const capsule = JSON.parse(json) as DelegationCapsuleJSON & { version?: number };
    const nodeIds = new Set<number>();
    const pushId = (value?: CapsuleNodeJSON | null) => {
      if (!value) return;
      if (typeof value.id === 'number') {
        nodeIds.add(value.id);
      }
    };
    pushId(capsule.primary ?? null);
    (capsule.secondary ?? []).forEach(pushId);
    (capsule.referenced ?? []).forEach(pushId);
    return {
      capsule,
      nodeIds: Array.from(nodeIds),
      version: typeof capsule.version === 'number' ? capsule.version : undefined,
    };
  } catch (error) {
    console.warn('MiniRAHExecutor: failed to parse delegation capsule', error);
    return { nodeIds: [] };
  }
}

function parseSourcesLine(summary: string): { line?: string; ids: number[] } {
  const lines = summary
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);
  const contextLine = lines.find(line => line.toLowerCase().startsWith('context sources used:'));
  if (!contextLine) {
    return { ids: [] };
  }
  const matches = contextLine.match(/\d+/g);
  const ids = matches ? matches.map(id => Number(id)).filter(id => Number.isFinite(id)) : [];
  return { line: contextLine, ids: Array.from(new Set(ids)) };
}

function validateMiniSummary(summary: string, expectedNodeIds: number[]): SummaryValidation {
  const trimmed = summary.trim();
  if (!trimmed) {
    return { status: 'failed', reason: 'Worker returned an empty summary.', sourcesUsed: [] };
  }

  const lines = trimmed.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const resultIndex = lines.findIndex(line => line.toLowerCase().startsWith('result:'));
  if (resultIndex === -1) {
    return { status: 'failed', reason: 'Missing or empty Result line in worker summary.', sourcesUsed: [] };
  }

  const resultLine = lines[resultIndex];
  const resultContent = resultLine.slice('result:'.length).trim();
  if (!resultContent) {
    const nextLine = lines[resultIndex + 1];
    if (!nextLine || /^(task:|actions:|node:|context sources used:|follow-up:)/i.test(nextLine)) {
      return { status: 'failed', reason: 'Missing or empty Result line in worker summary.', sourcesUsed: [] };
    }
  }

  const followUpLine = lines.find(line => line.toLowerCase().startsWith('follow-up:'));
  if (!followUpLine) {
    return { status: 'failed', reason: 'Missing Follow-up line in worker summary.', sourcesUsed: [] };
  }

  const { line: contextLine, ids } = parseSourcesLine(summary);
  if (!contextLine) {
    return { status: 'failed', reason: 'Missing "Context sources used" line. Workers must list node IDs they referenced.', sourcesUsed: [] };
  }
  if (expectedNodeIds.length > 0 && ids.length === 0) {
    return { status: 'failed', reason: 'Worker did not cite any node IDs even though a capsule was provided.', sourcesUsed: [] };
  }

  return { status: 'ok', sourcesUsed: ids };
}

export interface MiniRAHExecutionInput {
  sessionId: string;
  task: string;
  context: string[];
  expectedOutcome?: string | null;
  traceId?: string;
  parentChatId?: number;
  workflowKey?: string;
  workflowNodeId?: number;
}

export class MiniRAHExecutor {
  static async execute({ sessionId, task, context, expectedOutcome, traceId, parentChatId, workflowKey, workflowNodeId }: MiniRAHExecutionInput) {
    try {
      const delegateKey = process.env.RAH_DELEGATE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!delegateKey) {
        throw new Error('RAH_DELEGATE_OPENAI_API_KEY (or OPENAI_API_KEY) is not set.');
      }

      AgentDelegationService.markInProgress(sessionId);

      const promptSections = [
        `Task: ${task}`,
        context.length ? `Context:\n- ${context.join('\n- ')}` : undefined,
        expectedOutcome ? `Expected outcome: ${expectedOutcome}` : undefined,
        'Return only the final summary the orchestrator should see.'
      ].filter(Boolean);

      const openaiProvider = createOpenAI({ apiKey: delegateKey });
      const executorTools = getToolsForRole('executor');
      const capturedSummaries: string[] = [];
      const toolsUsedInSession: string[] = [];
      const integrateAllowed = workflowKey === 'integrate'
        ? new Set(['createEdge', 'updateEdge', 'updateNode'])
        : null;
      const wrappedTools = Object.fromEntries(
        Object.entries(executorTools)
          .filter(([name]) => {
            if (integrateAllowed) {
              return integrateAllowed.has(name);
            }
            return true;
          })
          .map(([name, tool]) => {
            const wrapped = {
              ...tool,
              async execute(params: any, context: any) {
                if (!toolsUsedInSession.includes(name)) {
                  toolsUsedInSession.push(name);
                }
                if (name === 'createEdge' && params && typeof params === 'object' && 'from_node_id' in params && 'to_node_id' in params) {
                  const fromId = Number(params.from_node_id);
                  const toId = Number(params.to_node_id);
                  if (Number.isFinite(fromId) && Number.isFinite(toId)) {
                    const exists = await edgeService.edgeExists(fromId, toId);
                    if (exists) {
                      const skipSummary = `Edge already exists between node ${fromId} and node ${toId}; skipping createEdge.`;
                      capturedSummaries.push(skipSummary);
                      return {
                        success: true,
                        skipped: true,
                        message: skipSummary,
                      };
                    }
                  }
                }

                const result = await tool.execute(params, context);
                const summary = summarizeToolExecution(name, params, result);
                if (summary) {
                  capturedSummaries.push(summary);
                }
                return result;
              }
            };
            return [name, wrapped];
          })
      );

      if ('delegateToMiniRAH' in wrappedTools) {
        console.warn('MiniRAHExecutor: delegateToMiniRAH detected in executor toolset. Removing to enforce single-level delegation.');
        delete wrappedTools.delegateToMiniRAH;
      }
      
      const userPrompt = promptSections.join('\n\n');
      const messages: CoreMessage[] = [{ role: 'user', content: userPrompt }];

      const maxIterations = 6;
      let rawSummary = '';
      let lastFinishReason: string | undefined;
      let lastToolCalls: any[] | undefined;

      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalTokens = 0;
      
      // Track if extraction tool was called (for Quick Add - should only call once)
      const isQuickAddTask = task.toLowerCase().includes('quick add');
      let extractionToolCalled = false;

      for (let iteration = 0; iteration < maxIterations; iteration++) {
        const response = await generateText({
          model: openaiProvider('gpt-4o-mini'),
          system: MINI_RAH_SYSTEM_PROMPT,
          messages,
          tools: wrappedTools,
        });

        const usage = response.usage;
        if (usage) {
          const inputTokens = (usage as any).promptTokens || usage.inputTokens || 0;
          const outputTokens = (usage as any).completionTokens || usage.outputTokens || 0;
          const combinedTotal = (usage as any).totalTokens || usage.totalTokens || inputTokens + outputTokens;
          totalInputTokens += inputTokens;
          totalOutputTokens += outputTokens;
          totalTokens += combinedTotal;
        }

        lastFinishReason = response.finishReason;
        lastToolCalls = response.toolCalls ?? [];

        if (response.finishReason === 'tool-calls' && response.toolCalls && response.toolCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: response.toolCalls.map(call => ({
              type: 'tool-call' as const,
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              input: (call as any).input ?? (call as any).args,
            })),
          });

          const toolResults: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; output: { type: 'text' | 'error-text'; value: string } }> = [];

          for (const call of response.toolCalls) {
            const callInput = (call as any).input ?? (call as any).args;
            const tool = wrappedTools[call.toolName];
            const isExtractionToolCall = isQuickAddTask && ['youtubeExtract', 'websiteExtract', 'paperExtract'].includes(call.toolName);

            if (isExtractionToolCall && extractionToolCalled) {
              const skipMessage = `Extraction already completed; skipping duplicate ${call.toolName} request.`;
              console.warn(`[MiniRAHExecutor] ${skipMessage}`);
              toolResults.push({
                type: 'tool-result',
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                output: { type: 'text', value: skipMessage },
              });
              continue;
            }

            if (!tool) {
              toolResults.push({
                type: 'tool-result',
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                output: { type: 'error-text', value: `Tool ${call.toolName} is not available.` },
              });
              continue;
            }

            try {
              const toolResult = await tool.execute(callInput, {});
              const summary = summarizeToolExecution(call.toolName, callInput, toolResult);
              const value = summary || `${call.toolName} completed.`;
              toolResults.push({
                type: 'tool-result',
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                output: { type: 'text', value },
              });
              
              // For Quick Add: stop after first successful extraction to prevent duplicates
              if (isExtractionToolCall) {
                const success = typeof toolResult === 'object' && toolResult !== null && (toolResult as any).success !== false;
                if (success) {
                  console.log(`[MiniRAHExecutor] Quick Add extraction succeeded, forcing summary generation to prevent duplicate calls`);
                  extractionToolCalled = true;
                  break;
                }
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Tool execution failed';
              toolResults.push({
                type: 'tool-result',
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                output: { type: 'error-text', value: message },
              });
            }
          }

          messages.push({ role: 'tool', content: toolResults });
          
          // If Quick Add extraction succeeded, request final summary and exit loop
          if (extractionToolCalled) {
            console.log('[MiniRAHExecutor] Requesting final summary after Quick Add extraction');
            messages.push({
              role: 'user',
              content: 'Extraction completed successfully. Provide your final summary now using the required format (Task/Actions/Result/Node/Context sources used/Follow-up).'
            });
            const summaryResponse = await generateText({
              model: openaiProvider('gpt-4o-mini'),
              system: MINI_RAH_SYSTEM_PROMPT,
              messages,
              tools: {}, // No tools - summary only
            });
            rawSummary = summaryResponse.text?.trim() || 'Extraction completed successfully.';
            break;
          }
          
          continue;
        }

        rawSummary = typeof response.text === 'string' ? response.text.trim() : '';
        if (!rawSummary) {
          console.warn('[MiniRAHExecutor] Worker returned empty summary.', {
            finishReason: response.finishReason,
            toolCalls: response.toolCalls,
            text: response.text,
          });
        }
        break;
      }

      if (!rawSummary) {
        console.warn('[MiniRAHExecutor] No summary after tool loop.', {
          lastFinishReason,
          lastToolCalls,
        });
      }

      const fallbackSummary = capturedSummaries.length > 0
        ? capturedSummaries[capturedSummaries.length - 1]
        : 'Completed the delegated task (worker returned no additional summary).';
      const initialSummary = rawSummary.length > 0 ? rawSummary : fallbackSummary;

      const capsuleInfo = extractCapsuleFromContext(context);
      const validation = validateMiniSummary(initialSummary, capsuleInfo.nodeIds);
      const validationStatus: DelegationStatus = validation.status === 'ok' ? 'completed' : 'failed';
      if (validation.status === 'failed') {
        console.warn('[MiniRAHExecutor] summary validation failed.', {
          reason: validation.reason,
          initialSummary,
        });
      }

      const finalSummary = validation.status === 'ok'
        ? initialSummary
        : `${initialSummary}\nValidation: ${validation.reason}`;

      console.log('[MiniRAHExecutor] summary:', finalSummary);

      // Calculate cost and log to chats table
      if (totalInputTokens > 0 || totalOutputTokens > 0 || totalTokens > 0) {
        const effectiveTotalTokens = totalTokens > 0 ? totalTokens : totalInputTokens + totalOutputTokens;

        const costResult = calculateCost({
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          modelId: 'gpt-4o-mini',
        });

        const usageData: UsageData = {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: effectiveTotalTokens,
          estimatedCostUsd: costResult.totalCostUsd,
          modelUsed: 'gpt-4o-mini',
          provider: 'openai',
          toolsUsed: toolsUsedInSession.length > 0 ? toolsUsedInSession : undefined,
          toolCallsCount: toolsUsedInSession.length > 0 ? toolsUsedInSession.length : undefined,
          traceId,
          parentChatId,
          workflowKey,
          workflowNodeId,
          capsuleVersion: capsuleInfo.version,
          contextSourcesUsed: validation.sourcesUsed.length > 0 ? validation.sourcesUsed : undefined,
          validationStatus: validation.status,
          validationMessage: validation.reason,
          fallbackAction: validation.status === 'failed' ? 'Review context capsule, hydrate nodes manually, then re-delegate with clarified instructions.' : undefined,
        };

        const delegation = AgentDelegationService.getDelegation(sessionId);
        const delegationId = delegation?.id;

        await ChatLoggingMiddleware.logChatInteraction(
          task,
          finalSummary,
          {
            helperName: 'mini-rah',
            agentType: 'executor',
            delegationId: delegationId ?? null,
            sessionId,
            usageData,
            traceId,
            parentChatId,
            workflowKey,
            workflowNodeId,
            systemMessage: MINI_RAH_SYSTEM_PROMPT,
          },
          []
        );

        console.log(`💰 [MiniRAHExecutor] Cost: $${costResult.totalCostUsd.toFixed(6)} (${effectiveTotalTokens} tokens)`);
      }

      return AgentDelegationService.completeDelegation(sessionId, finalSummary, validationStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown delegation error';
      AgentDelegationService.completeDelegation(sessionId, `Mini ra-h failed: ${message}`, 'failed');
      throw error;
    }
  }
}
