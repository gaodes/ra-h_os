import OpenAI from 'openai';
import type { AgentDefinition } from './agents/types';
import { Node } from '@/types/database';
import { getToolSchemas, executeTool } from '../tools/infrastructure/registry';
import { getSQLiteClient } from './database/sqlite-client';
import { apiKeyService } from './storage/apiKeys';

// Initialize OpenAI client with dynamic API key support
function getOpenAiClient(): OpenAI {
  const apiKey = apiKeyService.getOpenAiKey();
  if (!apiKey) {
    throw new Error('OpenAI API key required. Please:\n1. Click the Settings icon (⚙️) in the bottom left\n2. Go to API Keys tab\n3. Add your OpenAI API key\n\nGet your key at: https://platform.openai.com/api-keys');
  }
  return new OpenAI({ apiKey });
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ToolCall {
  id: string;
  name: string;
  params: any;
  result: any;
}

export interface ChatResponse {
  response: string;
  toolCalls?: ToolCall[];
}

export class AIService {
  /**
   * Chat with a helper using GPT-4o-mini with function calling
   */
  static async chatWithHelper(
    helper: AgentDefinition,
    message: string,
    selectedNodeIds: number[] = [],
    messageHistory: ChatMessage[] = []
  ): Promise<ChatResponse> {
    try {
      // Get selected nodes details
      const selectedNodes = await this.getSelectedNodes(selectedNodeIds);
      
      // Build context for tools
      const toolContext = {
        selectedNodes,
        database: getSQLiteClient()
      };

      // Build messages array
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: this.buildSystemPrompt(helper, selectedNodes)
        },
        // Add message history
        ...messageHistory.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        })),
        {
          role: 'user',
          content: message
        }
      ];

      // Get tool schemas for this helper
      const toolSchemas = getToolSchemas(helper.availableTools);

      // Make OpenAI API call
      const openai = getOpenAiClient();
      const completion = await openai.chat.completions.create({
        model: helper.model,
        messages,
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
        tool_choice: toolSchemas.length > 0 ? 'auto' : undefined,
        temperature: 0.7,
        max_tokens: 2000,
      });

      const assistantMessage = completion.choices[0]?.message;

      if (!assistantMessage) {
        throw new Error('No response from OpenAI');
      }

      let response = assistantMessage.content || '';
      const toolCalls: ToolCall[] = [];

      // Handle tool calls if present
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        console.log(`Agent ${helper.key} is calling ${assistantMessage.tool_calls.length} tools`);

        for (const toolCall of assistantMessage.tool_calls) {
          try {
            const toolName = toolCall.function.name;
            const toolParams = JSON.parse(toolCall.function.arguments);
            
            console.log(`Executing tool: ${toolName}`, toolParams);

            // Execute the tool
            const result = await executeTool(toolName, toolParams, toolContext);
            
            toolCalls.push({
              id: toolCall.id,
              name: toolName,
              params: toolParams,
              result
            });

            console.log(`Tool ${toolName} completed:`, result.success ? 'success' : 'failed');
          } catch (error) {
            console.error(`Error executing tool ${toolCall.function.name}:`, error);
            toolCalls.push({
              id: toolCall.id,
              name: toolCall.function.name,
              params: {},
              result: {
                success: false,
                error: error instanceof Error ? error.message : 'Tool execution failed'
              }
            });
          }
        }

        // If we have tool results, make another call to get the final response
        if (toolCalls.length > 0) {
          const toolMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            ...messages,
            {
              role: 'assistant',
              content: assistantMessage.content,
              tool_calls: assistantMessage.tool_calls
            },
            ...toolCalls.map(toolCall => ({
              role: 'tool' as const,
              tool_call_id: toolCall.id,
              content: JSON.stringify(toolCall.result)
            }))
          ];

          const finalCompletion = await getOpenAiClient().chat.completions.create({
            model: 'gpt-5-mini',
            messages: toolMessages,
            temperature: 0.7,
            max_tokens: 2000,
          });

          response = finalCompletion.choices[0]?.message?.content || response;
        }
      }

      return {
        response,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined
      };

    } catch (error) {
      console.error('Error in chatWithHelper:', error);
      throw new Error(
        error instanceof Error ? error.message : 'Failed to process chat message'
      );
    }
  }

  /**
   * Get selected nodes with their details
   */
  private static async getSelectedNodes(nodeIds: number[]): Promise<Node[]> {
    if (nodeIds.length === 0) return [];

    try {
      const sqlite = getSQLiteClient();
      const placeholders = nodeIds.map(() => '?').join(', ');
      const result = sqlite.query<any>(
        `SELECT n.id, n.title, n.content, n.link, n.metadata, n.chunk,
                n.chunk_status, n.embedding_updated_at, n.embedding_text,
                n.created_at, n.updated_at,
                COALESCE((SELECT JSON_GROUP_ARRAY(d.dimension)
                          FROM node_dimensions d WHERE d.node_id = n.id), '[]') as dimensions_json
         FROM nodes n
         WHERE n.id IN (${placeholders})
         ORDER BY n.created_at DESC`,
        nodeIds
      );
      return result.rows.map((row: any) => ({
        ...row,
        dimensions: JSON.parse(row.dimensions_json || '[]')
      }));
    } catch (error) {
      console.error('Error fetching selected nodes:', error);
      return [];
    }
  }

  /**
   * Build system prompt with context
   */
  private static buildSystemPrompt(helper: AgentDefinition, selectedNodes: Node[]): string {
    let systemPrompt = helper.systemPrompt;

    // Universal rule: ensure clickable node labels in UI
    systemPrompt += '\n\nNode references: Always format nodes as [NODE:id:"title"] so the UI renders clickable labels.';

    // Add context about selected nodes
    if (selectedNodes.length > 0) {
      systemPrompt += '\n\n## Selected Nodes Context\n';
      systemPrompt += `You have ${selectedNodes.length} node(s) selected:\n\n`;
      
      selectedNodes.forEach((node, index) => {
        systemPrompt += `${index + 1}. **${node.title || 'Untitled'}**\n`;
        if (node.dimensions?.length > 0) {
          systemPrompt += `   - Dimensions: ${node.dimensions.join(', ')}\n`;
        }
        if (node.link) {
          systemPrompt += `   - URL: ${node.link}\n`;
        }
        systemPrompt += '\n';
      });
    } else {
      systemPrompt += '\n\n## Context\nNo nodes are currently selected. You can still help with general queries and web searches.';
    }

    // Add available tools information
    if (helper.availableTools.length > 0) {
      systemPrompt += '\n\n## Available Tools\n';
      systemPrompt += `You have access to the following tools: ${helper.availableTools.join(', ')}\n`;
      systemPrompt += 'Use these tools when they would be helpful to answer the user\'s question.';
    }

    // Subtle, hard-coded intent capture across all helpers (non-intrusive)
    systemPrompt += '\n\n## Subtle Intent Capture\n';
    systemPrompt += [
      'When it would clearly help you serve better, briefly ask for the user\'s intent (their "why").',
      'Keep it lightweight and optional (one short sentence, once per topic).',
      'Examples: "What are you hoping to do with this?", "What\'s the goal behind adding this?"',
      'If the user answers, incorporate the rationale into your next steps and outputs.'
    ].join(' ');

    return systemPrompt;
  }
}
