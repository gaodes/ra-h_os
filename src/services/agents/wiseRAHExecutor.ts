import { streamText, CoreMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV2ToolResultOutput } from '@ai-sdk/provider';
import { AgentDelegationService } from '@/services/agents/delegation';
import { WISE_RAH_SYSTEM_PROMPT } from '@/config/prompts/wise-rah';
import { getToolsForRole } from '@/tools/infrastructure/registry';
import { ChatLoggingMiddleware } from '@/services/chat/middleware';
import { calculateCost } from '@/services/analytics/pricing';
import { UsageData } from '@/types/analytics';
import { summarizeToolExecution } from '@/services/agents/toolResultUtils';
import { edgeService } from '@/services/database/edges';
import { eventBroadcaster } from '@/services/events';
import { delegationStreamBroadcaster } from '@/app/api/rah/delegations/stream/route';
import { nodeService } from '@/services/database/nodes';
import { RequestContext } from '@/services/context/requestContext';
import { isLocalMode } from '@/config/runtime';

export interface WiseRAHExecutionInput {
  sessionId: string;
  task: string;
  context: string[];
  expectedOutcome?: string | null;
  traceId?: string;
  parentChatId?: number;
  workflowKey?: string;
  workflowNodeId?: number;
}

export class WiseRAHExecutor {
  static async execute({ sessionId, task, context, expectedOutcome, traceId, parentChatId, workflowKey, workflowNodeId }: WiseRAHExecutionInput) {
    console.log('🧙 [WiseRAHExecutor] Starting execution', { sessionId, task: task.substring(0, 100) });
    try {
      const requestContext = RequestContext.get();
      const wiseRahKey =
        requestContext.apiKeys?.openai ||
        process.env.RAH_WISE_RAH_OPENAI_API_KEY ||
        process.env.OPENAI_API_KEY;
      if (!wiseRahKey) {
        throw new Error('RAH_WISE_RAH_OPENAI_API_KEY (or OPENAI_API_KEY) is not set.');
      }

      AgentDelegationService.markInProgress(sessionId);
      console.log('✅ [WiseRAHExecutor] Delegation marked in progress');

      const normalizedTask = task.toLowerCase();
      const normalizedOutcome = (expectedOutcome || '').toLowerCase();
      const isWorkflow = Boolean(workflowKey) || normalizedTask.startsWith('execute workflow');
      const explicitWriteRequest = /\b(create|update|edge|append|workflow|integrate|summarize into node|link node|embed|ingest|synchronize)\b/.test(normalizedTask) ||
        /\b(create|update|edge|append|workflow|integrate|summarize into node|link node|embed|ingest|synchronize)\b/.test(normalizedOutcome);
      const allowWrites = isWorkflow || explicitWriteRequest;
      const analysisOnly = !allowWrites;
      const maxIterationsLimit = isWorkflow ? 20 : 5;
      const maxDelegationsAllowed = allowWrites ? (isWorkflow ? 12 : 2) : 0;
      const maxDistinctWebSearches = isWorkflow ? 6 : 4;
      const maxDistinctEmbeddingSearches = isWorkflow ? 5 : 3;

      const promptSections = [
        `Task: ${task}`,
        context.length ? `Context:\n- ${context.join('\n- ')}` : undefined,
        expectedOutcome ? `Expected outcome: ${expectedOutcome}` : undefined,
        analysisOnly ? 'Constraint: This is an analysis-only request. Stay strictly read-only: do not call delegateToMiniRAH and do not request new extractions. Work only with existing knowledge.' : undefined,
        'Return a structured summary following the format in your system prompt (Task/Actions/Result/Nodes/Follow-up).'
      ].filter(Boolean);

      const openaiProvider = createOpenAI({ apiKey: wiseRahKey });
      console.log('🔧 [WiseRAHExecutor] OpenAI provider created');
      
      const plannerTools = getToolsForRole('planner');
      
      // Remove delegateToMiniRAH for integrate workflow (wise-rah does updates directly)
      if (workflowKey === 'integrate' && plannerTools.delegateToMiniRAH) {
        delete plannerTools.delegateToMiniRAH;
        console.log('🚫 [WiseRAHExecutor] Removed delegateToMiniRAH for integrate workflow (direct updates only)');
      }
      
      // For analysis-only tasks, also remove delegation
      if (analysisOnly && plannerTools.delegateToMiniRAH) {
        delete plannerTools.delegateToMiniRAH;
      }
      
      console.log('🛠️ [WiseRAHExecutor] Planner tools retrieved:', Object.keys(plannerTools));
      
      const toolsUsedInSession: string[] = [];
      const delegatedEdgeKeys = new Set<string>();
      
      // Workflow progress is now streamed directly to delegation tabs via delegationStreamBroadcaster
      // No need to broadcast WORKFLOW_PROGRESS events to main chat anymore
      const wrappedTools = Object.fromEntries(
        Object.entries(plannerTools).map(([name, tool]) => {
          const wrapped = {
            ...tool,
            async execute(params: any, context: any) {
              if (!toolsUsedInSession.includes(name)) {
                toolsUsedInSession.push(name);
              }
              if (name === 'delegateToMiniRAH') {
                const extractEdgeKey = () => {
                  if (!params) return null;
                  const tryFromTask = () => {
                    if (typeof params.task !== 'string') return null;
                    const matches = [...params.task.matchAll(/\[NODE:(\d+)/g)];
                    if (matches.length >= 2) {
                      const fromId = Number(matches[0][1]);
                      const toId = Number(matches[1][1]);
                      if (Number.isFinite(fromId) && Number.isFinite(toId)) {
                        return `${fromId}->${toId}`;
                      }
                    }
                    return null;
                  };

                  const tryFromContext = () => {
                    if (!Array.isArray(params.context)) return null;
                    let fromId: number | null = null;
                    let toId: number | null = null;
                    for (const entry of params.context) {
                      if (typeof entry === 'string') {
                        const fromMatch = entry.match(/from_node_id\D+(\d+)/i);
                        const toMatch = entry.match(/to_node_id\D+(\d+)/i);
                        if (fromMatch && Number.isFinite(Number(fromMatch[1]))) {
                          fromId = Number(fromMatch[1]);
                        }
                        if (toMatch && Number.isFinite(Number(toMatch[1]))) {
                          toId = Number(toMatch[1]);
                        }
                      }
                    }
                    if (Number.isFinite(fromId as number) && Number.isFinite(toId as number)) {
                      return `${fromId}->${toId}`;
                    }
                    return null;
                  };

                  return tryFromTask() || tryFromContext();
                };

                const edgeKey = extractEdgeKey();
                if (edgeKey) {
                  if (delegatedEdgeKeys.has(edgeKey)) {
                    const [from, to] = edgeKey.split('->');
                    const message = `Skipped duplicate edge delegation for nodes ${from}→${to}.`;
                    workerSummaries.push(message);
                    return message;
                  }
                  delegatedEdgeKeys.add(edgeKey);
                  const [from, to] = edgeKey.split('->').map(Number);
                  if (Number.isFinite(from) && Number.isFinite(to)) {
                    const exists = await edgeService.edgeExists(from, to);
                    if (exists) {
                      const message = `Edge ${from}→${to} already exists; delegation skipped.`;
                      workerSummaries.push(message);
                      return message;
                    }
                  }
                }
              }

              return await tool.execute(params, context);
            }
          };
          return [name, wrapped];
        })
      );

      // Enforce read-only constraint - remove write tools EXCEPT for workflows
      // Workflows (like integrate) need updateNode for direct content updates
      const writeToolsToRemove = isWorkflow 
        ? ['createNode', 'createEdge', 'updateEdge', 'embedContent', 'youtubeExtract', 'websiteExtract', 'paperExtract', 'delegateToWiseRAH']
        : ['createNode', 'updateNode', 'createEdge', 'updateEdge', 'embedContent', 'youtubeExtract', 'websiteExtract', 'paperExtract', 'delegateToWiseRAH'];
      
      writeToolsToRemove.forEach(toolName => {
        if (toolName in wrappedTools) {
          console.warn(`WiseRAHExecutor: ${toolName} detected in planner toolset. Removing to enforce read-only constraint.`);
          delete wrappedTools[toolName];
        }
      });
      
      if (isWorkflow && 'updateNode' in wrappedTools) {
        console.log('✅ [WiseRAHExecutor] updateNode preserved for workflow execution');
      }
      console.log('🔒 [WiseRAHExecutor] Final tools after read-only enforcement:', Object.keys(wrappedTools));
      
      console.log('📝 [WiseRAHExecutor] Starting manual agentic loop...');

      const messages: CoreMessage[] = [
        { role: 'system', content: WISE_RAH_SYSTEM_PROMPT },
        { role: 'user', content: promptSections.join('\n\n') }
      ];

      let finalText = '';
      const totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      const maxIterations = maxIterationsLimit;

      const seenToolResults = new Map<string, { output: LanguageModelV2ToolResultOutput; summary: string }>();
      const workerSummaries: string[] = [];
      const workerSummarySet = new Set<string>();
      let hasPlan = false;
      let planReminderAdded = false;
      let planIncludesDelegation = false;
      let planRevisionNoticeSent = false;
      let delegationNudgeSent = false;
      let iterationsSincePlan = 0;
      let lastPlanSummary = '';
      let totalDelegations = 0;
      let didCreateEdge = false;
      let didUpdateNode = false;
      const uniqueWebQueries = new Set<string>();
      const uniqueEmbeddingQueries = new Set<string>();
      let finalSummaryRequested = false;
      let iterationsWithoutDelegation = 0;

      const ensureString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

      const sanitizeForBroadcast = (value: unknown) => {
        if (value === undefined) return undefined;
        try {
          return JSON.parse(JSON.stringify(value));
        } catch (error) {
          console.warn('[WiseRAHExecutor] Failed to serialize delegation payload', error);
          if (typeof value === 'string') return value;
          return undefined;
        }
      };

      const emitDelegationEvent = (payload: Record<string, unknown>) => {
        delegationStreamBroadcaster.broadcast(sessionId, payload);
      };

      const emitToolStart = (toolCallId: string, toolName: string, input: unknown) => {
        emitDelegationEvent({
          type: 'tool-input-start',
          toolCallId,
          toolName,
          input: sanitizeForBroadcast(input),
        });
      };

      const emitToolCompletion = (
        toolCallId: string,
        toolName: string,
        rawResult: unknown,
        summary: string,
        status: 'complete' | 'error' = 'complete',
        errorMessage?: string
      ) => {
        emitDelegationEvent({
          type: 'tool-output-available',
          toolCallId,
          toolName,
          result: sanitizeForBroadcast(rawResult),
          summary,
          status,
          error: errorMessage,
        });
      };

      const buildToolOutput = (toolName: string, summary: string, rawResult: any): LanguageModelV2ToolResultOutput => {
        const trimmedSummary = summary.trim();

        if (rawResult && typeof rawResult === 'object' && rawResult.success === false) {
          const message = trimmedSummary || ensureString(rawResult.error) || `${toolName} failed.`;
          return { type: 'error-text', value: message };
        }

        if (typeof rawResult === 'string') {
          const value = rawResult.trim() || trimmedSummary || `${toolName} completed.`;
          return { type: 'text', value };
        }

        if (trimmedSummary) {
          return { type: 'text', value: trimmedSummary };
        }

        return { type: 'text', value: `${toolName} completed.` };
      };

      const requestFinalSummary = async (instruction: string) => {
        messages.push({
          role: 'user',
          content: instruction,
        });

        const finalStreamResult = await streamText({
          model: openaiProvider('gpt-5'),
          messages,
          tools: {},
          maxOutputTokens: 500,
        });
        
        // Collect the complete response
        const finalChunks: string[] = [];
        for await (const chunk of finalStreamResult.textStream) {
          finalChunks.push(chunk);
        }
        
        const finalResponse = {
          text: finalChunks.join(''),
          usage: await finalStreamResult.usage,
        };

        totalUsage.inputTokens += finalResponse.usage?.inputTokens || 0;
        totalUsage.outputTokens += finalResponse.usage?.outputTokens || 0;
        totalUsage.totalTokens += finalResponse.usage?.totalTokens || 0;

        return finalResponse.text ?? '';
      };

      const normaliseForSignature = (toolName: string, input: any) => {
        if (!input || typeof input !== 'object') {
          return input;
        }

        if (toolName === 'webSearch' && 'query' in input) {
          const query = ensureString(input.query).toLowerCase().replace(/\s+/g, ' ').trim();
          return { ...input, query };
        }

        if (toolName === 'searchContentEmbeddings' && 'query' in input) {
          const query = ensureString(input.query).toLowerCase().replace(/\s+/g, ' ').trim();
          return { ...input, query };
        }

        return input;
      };

      for (let i = 0; i < maxIterations; i++) {
        console.log(`🔄 [WiseRAHExecutor] Iteration ${i + 1}/${maxIterations}`);
        
        // Touch delegation every iteration to prevent cleanup from killing it
        AgentDelegationService.touchDelegation(sessionId);

        const streamResult = await streamText({
          model: openaiProvider('gpt-5'),
          messages,
          tools: wrappedTools,
        });
        
        // Collect the complete response
        const chunks: string[] = [];
        for await (const chunk of streamResult.textStream) {
          chunks.push(chunk);
        }
        
        const response = {
          text: chunks.join(''),
          finishReason: await streamResult.finishReason,
          usage: await streamResult.usage,
          toolCalls: await streamResult.toolCalls,
        };

        totalUsage.inputTokens += response.usage?.inputTokens || 0;
        totalUsage.outputTokens += response.usage?.outputTokens || 0;
        totalUsage.totalTokens += response.usage?.totalTokens || 0;

        console.log(`📊 [WiseRAHExecutor] Step ${i + 1} finishReason:`, response.finishReason);

        // Stream text response to delegation chat
        if (response.text && response.text.trim()) {
          emitDelegationEvent({
            type: 'text-delta',
            delta: response.text,
          });
        }

        if (response.finishReason !== 'tool-calls') {
          finalText = response.text;
          console.log('✅ [WiseRAHExecutor] Got final text');
          break;
        }

        const toolCalls = response.toolCalls || [];
        console.log(`🔧 [WiseRAHExecutor] Executing ${toolCalls.length} tool calls`);
        
        // Broadcast new assistant message for next iteration
        if (toolCalls.length > 0) {
          emitDelegationEvent({ type: 'assistant-message' });
        }

        messages.push({
          role: 'assistant',
          content: toolCalls.map(call => ({
            type: 'tool-call' as const,
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            input: (call as any).input ?? (call as any).args,
          })),
        });

        const toolResults: Array<{
          type: 'tool-result';
          toolCallId: string;
          toolName: string;
          output: LanguageModelV2ToolResultOutput;
        }> = [];

        let executedTool = false;

        for (const call of toolCalls) {
          let callInputRaw = (call as any).input ?? (call as any).args;

          // Append logic now handled in updateNode tool itself (lines 27-44)

          const signatureInput = normaliseForSignature(call.toolName, callInputRaw);
          const signature = JSON.stringify({ tool: call.toolName, input: signatureInput });

          // Broadcast tool call to delegation stream
          emitToolStart(call.toolCallId, call.toolName, callInputRaw);

          if (!hasPlan && call.toolName !== 'think') {
            const warning = 'Planning required: use the think tool to outline a numbered plan (purpose, thoughts, next action) before other tools.';
            toolResults.push({
              type: 'tool-result',
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              output: { type: 'error-text', value: warning },
            });
            emitToolCompletion(call.toolCallId, call.toolName, { success: false }, warning, 'error', warning);
            
            if (!planReminderAdded) {
              planReminderAdded = true;
              messages.push({
                role: 'user',
                content: 'Before calling other tools, use the think tool to draft a numbered plan and specify your next action.',
              });
            }
            continue;
          }

          if (call.toolName !== 'think' && seenToolResults.has(signature)) {
            const cached = seenToolResults.get(signature)!;
            toolResults.push({
              type: 'tool-result',
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              output: cached.output,
            });
            
            // Broadcast cached result
            emitToolCompletion(call.toolCallId, call.toolName, cached.summary || 'Cached result', cached.summary || 'Cached result');

            if (call.toolName === 'delegateToMiniRAH' && cached.summary) {
              if (!workerSummarySet.has(cached.summary)) {
                workerSummarySet.add(cached.summary);
                workerSummaries.push(`[reused] ${cached.summary}`);
              }
            }
            continue;
          }

          const tool = wrappedTools[call.toolName];
          if (!tool) {
            const warning = `Tool ${call.toolName} is not available to wise ra-h.`;
            toolResults.push({
              type: 'tool-result',
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              output: { type: 'error-text', value: warning },
            });
            emitToolCompletion(call.toolCallId, call.toolName, { success: false }, warning, 'error', warning);

            continue;
          }

          try {
            const rawResult = await tool.execute(callInputRaw, {});
            const summary = summarizeToolExecution(call.toolName, callInputRaw, rawResult);
            const output = buildToolOutput(call.toolName, summary, rawResult);

            toolResults.push({
              type: 'tool-result',
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              output,
            });
            emitToolCompletion(call.toolCallId, call.toolName, rawResult, summary, 'complete');

            if (call.toolName === 'think') {
              hasPlan = true;
              lastPlanSummary = summary;
              if (allowWrites) {
                planIncludesDelegation = /delegate\b|delegateToMiniRAH|mini ra-h/i.test(summary);
              } else {
                planIncludesDelegation = false;
              }
              planRevisionNoticeSent = false;
              delegationNudgeSent = false;
              iterationsSincePlan = 0;
            } else {
              seenToolResults.set(signature, { output, summary });
              if (call.toolName === 'delegateToMiniRAH' && summary && !workerSummarySet.has(summary)) {
                workerSummarySet.add(summary);
                workerSummaries.push(summary);
                totalDelegations += 1;

                if (/Created edge/i.test(summary) || /Edge created/i.test(summary)) {
                  didCreateEdge = true;
                }
                if (/Updated node/i.test(summary) || /Appended/i.test(summary) || /content updated/i.test(summary)) {
                  didUpdateNode = true;
                }
              }
              if (call.toolName === 'webSearch') {
                const query = ensureString(signatureInput?.query ?? callInputRaw?.query);
                if (query) {
                  uniqueWebQueries.add(query);
                }
              }
              if (call.toolName === 'searchContentEmbeddings') {
                const query = ensureString(signatureInput?.query ?? callInputRaw?.query);
                if (query) {
                  uniqueEmbeddingQueries.add(query);
                }
              }
            }

            executedTool = true;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Tool execution failed';
            toolResults.push({
              type: 'tool-result',
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              output: { type: 'error-text', value: message },
            });
            emitToolCompletion(call.toolCallId, call.toolName, { success: false }, message, 'error', message);
          }
        }

        messages.push({
          role: 'tool',
          content: toolResults,
        });

        if (hasPlan) {
          iterationsSincePlan += 1;
          // Legacy delegation nudges removed - wise-rah completes workflows independently
        }

        const enoughMaterial = hasPlan && (allowWrites ? workerSummaries.length >= 2 : executedTool);
        const tooManyDelegations = allowWrites && totalDelegations >= maxDelegationsAllowed && maxDelegationsAllowed > 0;
        const webSearchCapReached = uniqueWebQueries.size >= maxDistinctWebSearches;
        const embeddingCapReached = uniqueEmbeddingQueries.size >= maxDistinctEmbeddingSearches;

        if (allowWrites && workflowKey === 'integrate' && totalDelegations === 0) {
          iterationsWithoutDelegation += 1;
          if (!delegationNudgeSent && iterationsWithoutDelegation >= 4) {
            delegationNudgeSent = true;
            const targetInstruction = workflowNodeId
              ? `Focus on node [NODE:${workflowNodeId}]. Delegate to mini ra-h now to (a) append integration insights to its content and (b) create edges to the highest-value related nodes you identified.`
              : 'Delegate to mini ra-h now to (a) append integration insights to the focused node and (b) create edges to the highest-value related nodes you identified.';
            messages.push({
              role: 'user',
              content: `${targetInstruction} Do not continue researching until those delegations are complete.`,
            });
            continue;
          }
        } else {
          iterationsWithoutDelegation = 0;
        }

        if (allowWrites && workflowKey === 'integrate' && didCreateEdge && !didUpdateNode) {
          messages.push({
            role: 'user',
            content: 'Edges are in place. Delegate to mini ra-h to append the Integration Insights section to the focused node before moving forward.',
          });
          continue;
        }

        const minIterationsBeforeSummary = allowWrites ? 2 : 1;
        if (!finalSummaryRequested && (tooManyDelegations || webSearchCapReached || embeddingCapReached || (enoughMaterial && executedTool && i >= minIterationsBeforeSummary))) {
          if (allowWrites && workflowKey === 'integrate' && !didUpdateNode) {
            messages.push({
              role: 'user',
              content: 'Before summarizing, delegate to mini ra-h to append the Integration Insights content to the focused node.',
            });
            continue;
          }

          if (allowWrites && totalDelegations === 0) {
            messages.push({
              role: 'user',
              content: 'You have not delegated any execution yet. Identify the concrete write actions required and call delegateToMiniRAH to perform them before summarising.',
            });
            continue;
          }

          let instruction = 'You have enough evidence from the workers. Provide the final Task/Actions/Result/Nodes/Follow-up summary now without further tool calls.';
          if (tooManyDelegations) {
            instruction = `You have already delegated the maximum allowed (${maxDelegationsAllowed}). Synthesize the findings now using the Task/Actions/Result/Nodes/Follow-up format. Do not call additional tools.`;
          } else if (webSearchCapReached) {
            instruction = `You have already issued about ${maxDistinctWebSearches} distinct web searches. Consolidate what you found into the final Task/Actions/Result/Nodes/Follow-up summary now—no additional tool calls.`;
          } else if (embeddingCapReached) {
            instruction = `Embedding searches have covered the knowledge base (limit ${maxDistinctEmbeddingSearches}). Switch to producing the Task/Actions/Result/Nodes/Follow-up summary—do not call further tools.`;
          }

          finalText = await requestFinalSummary(instruction);
          finalSummaryRequested = true;
          break;
        }
      }

      if (!finalText) {
        if (allowWrites && totalDelegations === 0) {
          throw new Error('Wise ra-h attempted to summarize without delegating any execution to mini ra-h.');
        }
        console.warn('⚠️ [WiseRAHExecutor] Max iterations hit with no summary. Requesting final response without tools.');
        finalText = await requestFinalSummary('You have gathered everything needed. Provide the final Task/Actions/Result/Nodes/Follow-up summary now. Do not call any tools.');
        console.log('✅ [WiseRAHExecutor] Final summary obtained after tool cutoff.');
      }

      const usage = totalUsage;
      let summary = typeof finalText === 'string' ? finalText.trim() : '';

     if (summary.length > 2000) {
        console.log('⚠️ [WiseRAHExecutor] Summary too long, requesting concise version.');
        summary = (await requestFinalSummary('Condense the findings into ≤300 tokens using the Task/Actions/Result/Nodes/Follow-up format. Focus on the most salient insights and reference key nodes. Do not call any tools.')).trim();
      }
      if (summary.length > 1000) {
        summary = `${summary.slice(0, 997)}…`;
      }
      console.log('📄 [WiseRAHExecutor] Summary after trim:', summary);
      console.log('📏 [WiseRAHExecutor] Summary length:', summary.length);
      
      if (!summary) {
        emitDelegationEvent({
          type: 'assistant-message',
        });
        emitDelegationEvent({
          type: 'text-delta',
          delta: 'Wise ra-h attempted to summarise but the response was empty. Check tool logs above for context.',
        });
        throw new Error('Wise ra-h returned empty summary');
      }

      console.log('[WiseRAHExecutor] summary:', summary);

      // Calculate cost and log to chats table
      if (usage) {
        const inputTokens = (usage as any).promptTokens || usage.inputTokens || 0;
        const outputTokens = (usage as any).completionTokens || usage.outputTokens || 0;
        const totalTokens = inputTokens + outputTokens;

        const costResult = calculateCost({
          inputTokens,
          outputTokens,
          modelId: 'gpt-5',
        });

        const usageData: UsageData = {
          inputTokens,
          outputTokens,
          totalTokens,
          estimatedCostUsd: costResult.totalCostUsd,
          modelUsed: 'gpt-5',
          provider: 'openai',
          toolsUsed: toolsUsedInSession.length > 0 ? toolsUsedInSession : undefined,
          toolCallsCount: toolsUsedInSession.length > 0 ? toolsUsedInSession.length : undefined,
          traceId,
          parentChatId,
          workflowKey,
          workflowNodeId,
        };

        const delegation = AgentDelegationService.getDelegation(sessionId);
        const delegationId = delegation?.id;

        await ChatLoggingMiddleware.logChatInteraction(
          task,
          summary,
          {
            helperName: 'wise-rah',
            agentType: 'planner',
            delegationId: delegationId ?? null,
            sessionId,
            usageData,
            traceId,
            parentChatId,
            workflowKey,
            workflowNodeId,
            systemMessage: WISE_RAH_SYSTEM_PROMPT,
            backendUsage: [],
          },
          []
        );

        console.log(`💰 [WiseRAHExecutor] Cost: $${costResult.totalCostUsd.toFixed(6)} (${totalTokens} tokens)`);
      }

      console.log('✅ [WiseRAHExecutor] Completing delegation with summary');
      return AgentDelegationService.completeDelegation(sessionId, summary);
    } catch (error) {
      console.error('❌ [WiseRAHExecutor] Error during execution:', error);
      console.error('❌ [WiseRAHExecutor] Error stack:', error instanceof Error ? error.stack : 'No stack');
      const message = error instanceof Error ? error.message : 'Unknown delegation error';
      
      // Broadcast error to delegation stream
      delegationStreamBroadcaster.broadcast(sessionId, {
        type: 'assistant-message',
      });
      delegationStreamBroadcaster.broadcast(sessionId, {
        type: 'text-delta',
        delta: `Wise ra-h failed: ${message}`,
      });
      
      AgentDelegationService.completeDelegation(sessionId, `Wise ra-h failed: ${message}`, 'failed');
      throw error;
    }
  }
}
