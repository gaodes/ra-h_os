import { getToolGroup, groupTools, getAllToolsByGroup } from './groups';
import { queryNodesTool } from '../database/queryNodes';
import { getNodesByIdTool } from '../database/getNodesById';
import { createNodeTool } from '../database/createNode';
import { updateNodeTool } from '../database/updateNode';
import { createEdgeTool } from '../database/createEdge';
import { queryEdgeTool } from '../database/queryEdge';
import { updateEdgeTool } from '../database/updateEdge';
import { createDimensionTool } from '../database/createDimension';
import { updateDimensionTool } from '../database/updateDimension';
import { lockDimensionTool } from '../database/lockDimension';
import { unlockDimensionTool } from '../database/unlockDimension';
import { deleteDimensionTool } from '../database/deleteDimension';
import { queryDimensionsTool } from '../database/queryDimensions';
import { getDimensionTool } from '../database/getDimension';
import { searchContentEmbeddingsTool } from '../other/searchContentEmbeddings';
import { webSearchTool } from '../other/webSearch';
import { thinkTool } from '../other/think';
import { delegateToMiniRAHTool } from '../orchestration/delegateToMiniRAH';
import { delegateNodeQuotesTool, delegateNodeComparisonTool } from '../orchestration/delegationHelpers';
import { delegateToWiseRAHTool } from '../orchestration/delegateToWiseRAH';
import { executeWorkflowTool } from '../orchestration/executeWorkflow';
import { youtubeExtractTool } from '../other/youtubeExtract';
import { websiteExtractTool } from '../other/websiteExtract';
import { paperExtractTool } from '../other/paperExtract';

// Core tools available to all agents (read-only graph operations)
const CORE_TOOLS: Record<string, any> = {
  queryNodes: queryNodesTool,
  getNodesById: getNodesByIdTool,
  queryEdge: queryEdgeTool,
  queryDimensions: queryDimensionsTool,
  getDimension: getDimensionTool,
  searchContentEmbeddings: searchContentEmbeddingsTool,
};

const ORCHESTRATION_TOOLS: Record<string, any> = {
  webSearch: webSearchTool,
  think: thinkTool,
  delegateToMiniRAH: delegateToMiniRAHTool,
  delegateNodeQuotes: delegateNodeQuotesTool,
  delegateNodeComparison: delegateNodeComparisonTool,
  delegateToWiseRAH: delegateToWiseRAHTool,
  executeWorkflow: executeWorkflowTool,
};

// Execution tools for worker agents (includes write operations)
const EXECUTION_TOOLS: Record<string, any> = {
  createNode: createNodeTool,
  updateNode: updateNodeTool,
  createEdge: createEdgeTool,
  updateEdge: updateEdgeTool,
  createDimension: createDimensionTool,
  updateDimension: updateDimensionTool,
  lockDimension: lockDimensionTool,
  unlockDimension: unlockDimensionTool,
  deleteDimension: deleteDimensionTool,
  youtubeExtract: youtubeExtractTool,
  websiteExtract: websiteExtractTool,
  paperExtract: paperExtractTool,
};

export const TOOL_SETS = {
  core: CORE_TOOLS,
  orchestration: ORCHESTRATION_TOOLS,
  execution: EXECUTION_TOOLS,
};

export const TOOLS: Record<string, any> = {
  ...CORE_TOOLS,
  ...ORCHESTRATION_TOOLS,
  ...EXECUTION_TOOLS,
};

const ORCHESTRATOR_TOOL_NAMES = Array.from(new Set([
  ...Object.keys(CORE_TOOLS),
  'webSearch',
  'think',
  'executeWorkflow',
  'createNode',
  'updateNode',
  'createEdge',
  'updateEdge',
  'createDimension',
  'updateDimension',
  'lockDimension',
  'unlockDimension',
  'deleteDimension',
  'youtubeExtract',
  'websiteExtract',
  'paperExtract',
]));

const EXECUTOR_TOOL_NAMES = [
  ...Object.keys(CORE_TOOLS),
  ...Object.keys(ORCHESTRATION_TOOLS).filter(name => 
    name !== 'delegateToMiniRAH' &&
    name !== 'delegateToWiseRAH' &&
    name !== 'executeWorkflow' &&
    name !== 'delegateNodeQuotes' &&
    name !== 'delegateNodeComparison'
  ),
  ...Object.keys(EXECUTION_TOOLS),
];

const PLANNER_TOOL_NAMES = [
  ...Object.keys(CORE_TOOLS),
  'webSearch',
  'think',
  'delegateToMiniRAH',
  'updateNode', // For workflow execution (integrate workflow needs direct write access)
];

/**
 * Get tool by ID
 */
export function getTool(toolId: string): any | null {
  return TOOLS[toolId] || null;
}

/**
 * Get tools by IDs (for helper's available_tools)
 */
export function getTools(toolIds: string[]): any[] {
  if (!Array.isArray(toolIds)) {
    console.error('getTools received non-array:', toolIds);
    return [];
  }
  return toolIds.map(id => TOOLS[id]).filter(Boolean);
}

/**
 * Get all available tools
 */
export function getAllTools(): any[] {
  return Object.values(TOOLS);
}

/**
 * Get tool schemas for OpenAI function calling
 */
export function getToolSchemas(toolIds: string[]) {
  return getTools(toolIds).map(tool => tool.schema);
}

/**
 * Get tools for a specific helper by tool names
 * This is the main function used by helper APIs to get their assigned tools
 */
export function getHelperTools(availableToolNames: string[]): Record<string, any> {
  if (!Array.isArray(availableToolNames)) {
    console.error('getHelperTools received non-array:', availableToolNames);
    return {};
  }
  
  return availableToolNames.reduce((tools, name) => {
    if (TOOLS[name]) {
      tools[name] = TOOLS[name];
    } else {
      console.warn(`Tool '${name}' not found in registry`);
    }
    return tools;
  }, {} as Record<string, any>);
}

export function getDefaultToolNamesForRole(role: 'orchestrator' | 'executor' | 'planner'): string[] {
  if (role === 'orchestrator') {
    return [...ORCHESTRATOR_TOOL_NAMES];
  }
  if (role === 'planner') {
    return [...PLANNER_TOOL_NAMES];
  }
  return [...EXECUTOR_TOOL_NAMES];
}

export function getToolsForRole(role: 'orchestrator' | 'executor' | 'planner'): Record<string, any> {
  const names = getDefaultToolNamesForRole(role);
  return getHelperTools(names);
}

/**
 * Execute a tool with given parameters and context
 */
export async function executeTool(toolId: string, params: any, context: any) {
  const tool = getTool(toolId);
  
  if (!tool) {
    return {
      success: false,
      error: `Tool '${toolId}' not found`,
      data: null
    };
  }
  
  try {
    return await tool.execute(params, context);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : `Tool '${toolId}' execution failed`,
      data: null
    };
  }
}

// Export group utilities
export { getToolGroup, groupTools, getAllToolsByGroup };
