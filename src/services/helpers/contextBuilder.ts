import { Node } from '@/types/database';
import { AgentRegistry } from '@/services/agents/registry';
import { WorkflowRegistry } from '@/services/workflows/registry';
import { getHelperTools, getDefaultToolNamesForRole } from '@/tools/infrastructure/registry';
import type { CacheableBlock, SystemPromptResult } from '@/types/prompts';
import { buildAutoContextBlock } from '@/services/context/autoContext';

export interface NodeContext {
  nodes: Node[];
  activeNodeId: number | null;
}

export interface ContextBuilderOptions {
  maxPrimaryContent?: number;    // Default: 500 chars
  maxSecondaryContent?: number;  // Default: 200 chars
  includeMetadata?: boolean;     // Include created/updated timestamps
}

const BASE_CONTEXT = `=== RA-H BASE CONTEXT ===
- Nodes store content (title, content, dimensions, metadata, link, chunk)
- Edges capture directed relationships between nodes
- Dimensions organize nodes; locked dimensions (isPriority=true) auto-assign to new nodes
- You can create and manage dimensions using dimension tools (createDimension, updateDimension, lockDimension, unlockDimension, deleteDimension)
- When auto-context is enabled you'll see BACKGROUND CONTEXT with the 10 most-connected nodes (ID + title only)
- Focused nodes show truncated content; use queryNodes, searchContentEmbeddings, or queryEdge when you need full detail
- Node references must use [NODE:id:"title"] so the UI renders clickable labels
- Pronouns or phrases like "this conversation/paper/video" refer to the primary focused node unless clarified
`;

function buildStaticBaseContext(): string {
  return BASE_CONTEXT;
}

function buildAgentInstructionsBlock(helperKey: string, systemPrompt: string): string {
  return `=== AGENT INSTRUCTIONS (${helperKey}) ===\n${systemPrompt}\n`;
}

function isPrimaryOrchestrator(helperKey: string): boolean {
  return helperKey === 'ra-h' || helperKey === 'ra-h-easy';
}

function buildToolDefinitionsBlock(toolNames: string[]): string {
  if (!Array.isArray(toolNames) || toolNames.length === 0) {
    return '';
  }

  const tools = getHelperTools(toolNames);
  const lines: string[] = ['=== AVAILABLE TOOLS ==='];

  Object.entries(tools).forEach(([name, tool]) => {
    if (tool?.description) {
      lines.push(`\n## ${name}\n${tool.description.trim()}`);
    }
  });

  return lines.join('\n');
}

async function buildWorkflowDefinitionsBlock(helperKey: string): Promise<string | null> {
  // Only include for primary orchestrator variants
  if (!isPrimaryOrchestrator(helperKey)) {
    return null;
  }

  try {
    const workflows = await WorkflowRegistry.getEnabledWorkflows();
    if (workflows.length === 0) return null;

    const lines: string[] = ['=== AVAILABLE WORKFLOWS ==='];

    for (const workflow of workflows) {
      lines.push(`\n## ${workflow.displayName} (${workflow.key})`);
      lines.push(workflow.description);
    }

    return lines.join('\n');
  } catch (error) {
    console.warn('Workflow definitions load failed (contextBuilder):', error);
    return null;
  }
}

function truncateToWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '…';
}

function parseMetadata(metadata: unknown): Record<string, any> {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch (error) {
      console.warn('Failed to parse node metadata JSON:', error);
      return {};
    }
  }
  if (typeof metadata === 'object') {
    return metadata as Record<string, any>;
  }
  return {};
}

function describeChunkStatus(node: Node): string {
  const status = node.chunk_status || 'unknown';
  const chunkLength = typeof node.chunk === 'string' ? node.chunk.length : 0;
  const approxChars = chunkLength > 0 ? ` (~${Math.max(1, Math.round(chunkLength / 1000))}k chars)` : '';
  const metadata = parseMetadata(node.metadata);
  const transcriptLength = typeof metadata.transcript_length === 'number'
    ? metadata.transcript_length
    : undefined;
  let transcriptLabel = '';
  if (transcriptLength && transcriptLength > 0) {
    transcriptLabel = `, transcript ≈${Math.max(1, Math.round(transcriptLength / 1000))}k chars`;
  }
  const embeddingsAvailable = status === 'chunked' || chunkLength > 0;
  return `Chunks: ${status}${approxChars}${transcriptLabel}; Embeddings: ${embeddingsAvailable ? 'available' : 'missing'}`;
}

/**
 * Builds the dynamic focused nodes context section
 */
export function buildFocusedNodesBlock(
  context: NodeContext,
  options: ContextBuilderOptions = {}
): string {
  if (!context.nodes || context.nodes.length === 0) {
    return '\n=== CURRENT FOCUS ===\nNo nodes currently in focus.';
  }

  let contextString = '=== CURRENT FOCUS ===';
  contextString += '\n25-word previews; use queryNodes/searchContentEmbeddings for full detail\n';

  const validNodes = context.nodes.filter(n => n != null);
  const activeNode = validNodes.find(n => n.id === context.activeNodeId);
  const otherNodes = validNodes.filter(n => n.id !== context.activeNodeId);

  if (activeNode) {
    contextString += `\n[PRIMARY - Tab 1]\nID: ${activeNode.id} | "${activeNode.title || 'Untitled'}"\n${truncateToWords(activeNode.content || 'No content', 25)}\nLink: ${activeNode.link || 'No link'}`;
    contextString += `\n${describeChunkStatus(activeNode)}`;
  }

  if (otherNodes.length > 0) {
    otherNodes.forEach((node, index) => {
      contextString += `\n\n[Tab ${index + 2}]\nID: ${node.id} | "${node.title || 'Untitled'}"\n${truncateToWords(node.content || 'No content', 25)}\nLink: ${node.link || 'No link'}\n${describeChunkStatus(node)}`;
    });
  }

  contextString += '\n===================================';
  return contextString;
}

/**
 * Builds system prompt as cacheable blocks (Anthropic prompt caching)
 */
export async function buildSystemPromptBlocks(
  nodeContext: NodeContext,
  helperComponentKey: string,
  options?: ContextBuilderOptions
): Promise<SystemPromptResult> {
  const helper = await AgentRegistry.getAgentByKey(helperComponentKey);
  const isAnthropic = helper?.model?.startsWith('anthropic/');
  const cacheControl = isAnthropic ? { type: 'ephemeral' as const } : undefined;
  const blocks: CacheableBlock[] = [];

  const baseContext = buildStaticBaseContext().trim();
  const helperPrompt = helper?.systemPrompt || 'No instructions provided.';
  const instructionsBlock = buildAgentInstructionsBlock(helperComponentKey, helperPrompt).trim();

  const combinedInstructions = [baseContext, instructionsBlock]
    .filter(section => section.length > 0)
    .join('\n\n');

  if (combinedInstructions.length > 0) {
    blocks.push({
      type: 'text',
      text: combinedInstructions,
      ...(cacheControl ? { cache_control: cacheControl } : {})
    });
  }

  const availableToolNames = helper?.availableTools?.length
    ? helper.availableTools
    : getDefaultToolNamesForRole(helper?.role === 'executor' ? 'executor' : 'orchestrator');
  const toolBlock = buildToolDefinitionsBlock(availableToolNames);
  if (toolBlock.trim().length > 0) {
    blocks.push({
      type: 'text',
      text: toolBlock,
      ...(cacheControl ? { cache_control: cacheControl } : {})
    });
  }

  const workflowBlock = await buildWorkflowDefinitionsBlock(helperComponentKey);
  if (workflowBlock && workflowBlock.trim().length > 0) {
    blocks.push({
      type: 'text',
      text: workflowBlock,
      ...(cacheControl ? { cache_control: cacheControl } : {})
    });
  }

  const autoContextBlock = isPrimaryOrchestrator(helperComponentKey)
    ? buildAutoContextBlock()
    : null;
  if (autoContextBlock && autoContextBlock.trim().length > 0) {
    blocks.push({
      type: 'text',
      text: autoContextBlock,
      ...(cacheControl ? { cache_control: cacheControl } : {})
    });
  }

  const focusBlock = buildFocusedNodesBlock(nodeContext, options);
  blocks.push({ type: 'text', text: focusBlock });

  return { blocks, cacheHit: false };
}

/**
 * Legacy string-based system prompt (for backward compatibility)
 * @deprecated Use buildSystemPromptBlocks for Anthropic caching support
 */
export async function buildSystemPrompt(
  nodeContext: NodeContext,
  helperComponentKey: string,
  options?: ContextBuilderOptions
): Promise<{ systemPrompt: string; cacheHit: boolean }> {
  // Convert blocks to string for legacy callers
  const result = await buildSystemPromptBlocks(nodeContext, helperComponentKey, options);
  const systemPrompt = result.blocks.map(b => b.text).join('');
  return { systemPrompt, cacheHit: result.cacheHit };
}

/**
 * Loads helper instructions from JSON file
 */
// DB-backed; no-op placeholder kept for API stability if imported elsewhere
