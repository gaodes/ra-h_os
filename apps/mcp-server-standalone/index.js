#!/usr/bin/env node
'use strict';

const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

const { initDatabase, getDatabasePath, closeDatabase } = require('./services/sqlite-client');
const nodeService = require('./services/nodeService');
const edgeService = require('./services/edgeService');
const dimensionService = require('./services/dimensionService');

// Server info
const serverInfo = {
  name: 'ra-h-standalone',
  version: '1.1.0'
};

const instructions = [
  "RA-H is the user's personal knowledge graph — local SQLite, fully on-device.",
  'Call rah_get_context first to see what\'s in the graph.',
  'Proactively identify valuable information in conversations and offer to save it.',
  'Search before creating to avoid duplicates.',
  'Every edge needs an explanation — why does this connection exist?',
  'All data stays on this device.'
].join(' ');

// Tool schemas
const addNodeInputSchema = {
  title: z.string().min(1).max(160).describe('Clear, descriptive title'),
  content: z.string().max(20000).optional().describe('Node content/notes'),
  link: z.string().url().optional().describe('Source URL'),
  description: z.string().max(2000).optional().describe('One-sentence summary. Helps search and AI understanding.'),
  dimensions: z.array(z.string()).min(1).max(5).describe('1-5 categories. Call rah_list_dimensions first to use existing ones.'),
  metadata: z.record(z.any()).optional().describe('Additional metadata'),
  chunk: z.string().max(50000).optional().describe('Full source text')
};

const searchNodesInputSchema = {
  query: z.string().min(1).max(400).describe('Search query'),
  limit: z.number().min(1).max(25).optional().describe('Max results (default 10)'),
  dimensions: z.array(z.string()).max(5).optional().describe('Filter by dimensions')
};

const getNodesInputSchema = {
  nodeIds: z.array(z.number().int().positive()).min(1).max(10).describe('Node IDs to load')
};

const updateNodeInputSchema = {
  id: z.number().int().positive().describe('Node ID'),
  updates: z.object({
    title: z.string().optional().describe('New title'),
    content: z.string().optional().describe('Content to APPEND'),
    link: z.string().optional().describe('New link'),
    dimensions: z.array(z.string()).optional().describe('New dimensions (replaces existing)'),
    metadata: z.record(z.any()).optional().describe('New metadata')
  }).describe('Fields to update')
};

const createEdgeInputSchema = {
  sourceId: z.number().int().positive().describe("The 'subject' node (reads: source [explanation] target)"),
  targetId: z.number().int().positive().describe('Target node ID'),
  explanation: z.string().min(1).describe("Human-readable explanation. Should read as a sentence: 'Alice invented this technique'")
};

const updateEdgeInputSchema = {
  id: z.number().int().positive().describe('Edge ID'),
  explanation: z.string().min(1).describe('Updated explanation for this connection')
};

const queryEdgesInputSchema = {
  nodeId: z.number().int().positive().optional().describe('Find edges for this node'),
  limit: z.number().min(1).max(50).optional().describe('Max edges (default 25)')
};

const listDimensionsInputSchema = {};

const createDimensionInputSchema = {
  name: z.string().min(1).describe('Dimension name'),
  description: z.string().max(500).optional().describe('Description'),
  isPriority: z.boolean().optional().describe('Lock for auto-assignment')
};

const updateDimensionInputSchema = {
  name: z.string().min(1).describe('Current dimension name'),
  newName: z.string().optional().describe('New name (for renaming)'),
  description: z.string().max(500).optional().describe('New description'),
  isPriority: z.boolean().optional().describe('Lock/unlock dimension')
};

const deleteDimensionInputSchema = {
  name: z.string().min(1).describe('Dimension name to delete')
};

// Helper to sanitize dimensions
function sanitizeDimensions(raw) {
  if (!Array.isArray(raw)) return [];
  const result = [];
  const seen = new Set();
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const lowered = trimmed.toLowerCase();
    if (seen.has(lowered)) continue;
    seen.add(lowered);
    result.push(trimmed);
    if (result.length >= 5) break;
  }
  return result;
}

// Log to stderr (stdout is reserved for MCP protocol)
function log(...args) {
  console.error('[ra-h-standalone]', ...args);
}

async function main() {
  // Initialize database
  try {
    initDatabase();
    log('Database connected:', getDatabasePath());
  } catch (error) {
    log('ERROR:', error.message);
    process.exit(1);
  }

  const server = new McpServer(serverInfo, { instructions });

  // ========== CONTEXT TOOL ==========

  server.registerTool(
    'rah_get_context',
    {
      title: 'Get RA-H context',
      description: 'Get knowledge graph overview: stats, hub nodes (most connected), dimensions, and recent activity. Call this first to understand the user\'s graph.',
      inputSchema: {}
    },
    async () => {
      const context = nodeService.getContext();

      // First-run welcome message
      if (context.stats.nodeCount === 0) {
        return {
          content: [{ type: 'text', text: 'Empty knowledge graph. This is a fresh start! Suggest adding the first node about something the user is working on or interested in.' }],
          structuredContent: {
            ...context,
            welcome: true,
            suggestion: 'Ask the user what they\'re working on or interested in, then create the first node.'
          }
        };
      }

      const summary = `Graph: ${context.stats.nodeCount} nodes, ${context.stats.edgeCount} edges, ${context.stats.dimensionCount} dimensions.`;
      return {
        content: [{ type: 'text', text: summary }],
        structuredContent: context
      };
    }
  );

  // ========== NODE TOOLS ==========

  server.registerTool(
    'rah_add_node',
    {
      title: 'Add RA-H node',
      description: 'Create a new node in the knowledge graph. Always search first (rah_search_nodes) to avoid duplicates.',
      inputSchema: addNodeInputSchema
    },
    async ({ title, content, link, description, dimensions, metadata, chunk }) => {
      const normalizedDimensions = sanitizeDimensions(dimensions);
      if (normalizedDimensions.length === 0) {
        throw new Error('At least one dimension is required.');
      }

      const node = nodeService.createNode({
        title: title.trim(),
        content: content?.trim(),
        link: link?.trim(),
        description: description?.trim(),
        dimensions: normalizedDimensions,
        metadata: metadata || {},
        chunk: chunk?.trim()
      });

      const summary = `Created node #${node.id}: ${node.title} [${node.dimensions.join(', ')}]`;

      return {
        content: [{ type: 'text', text: summary }],
        structuredContent: {
          nodeId: node.id,
          title: node.title,
          dimensions: node.dimensions,
          message: summary
        }
      };
    }
  );

  server.registerTool(
    'rah_search_nodes',
    {
      title: 'Search RA-H nodes',
      description: 'Search the knowledge graph by keyword. Call before creating nodes to check for duplicates.',
      inputSchema: searchNodesInputSchema
    },
    async ({ query, limit = 10, dimensions }) => {
      const normalizedDimensions = sanitizeDimensions(dimensions || []);

      const nodes = nodeService.getNodes({
        search: query.trim(),
        limit: Math.min(Math.max(limit, 1), 25),
        dimensions: normalizedDimensions.length > 0 ? normalizedDimensions : undefined
      });

      const summary = nodes.length === 0
        ? 'No nodes found matching that query.'
        : `Found ${nodes.length} node(s).`;

      return {
        content: [{ type: 'text', text: summary }],
        structuredContent: {
          count: nodes.length,
          nodes: nodes.map(node => ({
            id: node.id,
            title: node.title,
            content: node.content ?? null,
            description: node.description ?? null,
            link: node.link ?? null,
            dimensions: node.dimensions || [],
            updated_at: node.updated_at
          }))
        }
      };
    }
  );

  server.registerTool(
    'rah_get_nodes',
    {
      title: 'Get RA-H nodes by ID',
      description: 'Load full node records by their IDs.',
      inputSchema: getNodesInputSchema
    },
    async ({ nodeIds }) => {
      const uniqueIds = [...new Set(nodeIds.filter(id => Number.isFinite(id) && id > 0))];
      if (uniqueIds.length === 0) {
        throw new Error('No valid node IDs provided.');
      }

      const nodes = [];
      for (const id of uniqueIds) {
        const node = nodeService.getNodeById(id);
        if (node) {
          nodes.push({
            id: node.id,
            title: node.title,
            content: node.content ?? null,
            description: node.description ?? null,
            link: node.link ?? null,
            dimensions: node.dimensions || [],
            updated_at: node.updated_at
          });
        }
      }

      return {
        content: [{ type: 'text', text: `Loaded ${nodes.length} of ${uniqueIds.length} nodes.` }],
        structuredContent: {
          count: nodes.length,
          nodes
        }
      };
    }
  );

  server.registerTool(
    'rah_update_node',
    {
      title: 'Update RA-H node',
      description: 'Update an existing node. Content is APPENDED, dimensions are replaced.',
      inputSchema: updateNodeInputSchema
    },
    async ({ id, updates }) => {
      if (!updates || Object.keys(updates).length === 0) {
        throw new Error('At least one field must be provided in updates.');
      }

      const node = nodeService.updateNode(id, updates, { appendContent: true });

      return {
        content: [{ type: 'text', text: `Updated node #${id}` }],
        structuredContent: {
          success: true,
          nodeId: node.id,
          message: `Updated node #${id}`
        }
      };
    }
  );

  // ========== EDGE TOOLS ==========

  server.registerTool(
    'rah_create_edge',
    {
      title: 'Create RA-H edge',
      description: 'Connect two nodes. Edges are the most valuable part of the graph — they represent understanding, not just proximity.',
      inputSchema: createEdgeInputSchema
    },
    async ({ sourceId, targetId, explanation }) => {
      const edge = edgeService.createEdge({
        from_node_id: sourceId,
        to_node_id: targetId,
        explanation: explanation.trim(),
        source: 'mcp'
      });

      return {
        content: [{ type: 'text', text: `Created edge from #${sourceId} to #${targetId}` }],
        structuredContent: {
          success: true,
          edgeId: edge.id,
          message: `Created edge from #${sourceId} to #${targetId}`
        }
      };
    }
  );

  server.registerTool(
    'rah_update_edge',
    {
      title: 'Update RA-H edge',
      description: 'Update an edge explanation. Use when a connection needs a better or corrected explanation.',
      inputSchema: updateEdgeInputSchema
    },
    async ({ id, explanation }) => {
      const edge = edgeService.updateEdge(id, { explanation: explanation.trim() });

      return {
        content: [{ type: 'text', text: `Updated edge #${id}` }],
        structuredContent: {
          success: true,
          edgeId: edge.id,
          message: `Updated edge #${id}`
        }
      };
    }
  );

  server.registerTool(
    'rah_query_edges',
    {
      title: 'Query RA-H edges',
      description: 'Find connections between nodes.',
      inputSchema: queryEdgesInputSchema
    },
    async ({ nodeId, limit = 25 }) => {
      const edges = edgeService.getEdges({
        nodeId,
        limit: Math.min(Math.max(limit, 1), 50)
      });

      return {
        content: [{ type: 'text', text: `Found ${edges.length} edge(s).` }],
        structuredContent: {
          count: edges.length,
          edges: edges.map(e => ({
            id: e.id,
            from_node_id: e.from_node_id,
            to_node_id: e.to_node_id,
            type: e.context?.type ?? null,
            explanation: e.context?.explanation ?? null
          }))
        }
      };
    }
  );

  // ========== DIMENSION TOOLS ==========

  server.registerTool(
    'rah_list_dimensions',
    {
      title: 'List RA-H dimensions',
      description: 'Get all dimensions with node counts.',
      inputSchema: listDimensionsInputSchema
    },
    async () => {
      const dimensions = dimensionService.getDimensions();

      return {
        content: [{ type: 'text', text: `Found ${dimensions.length} dimension(s).` }],
        structuredContent: {
          count: dimensions.length,
          dimensions
        }
      };
    }
  );

  server.registerTool(
    'rah_create_dimension',
    {
      title: 'Create RA-H dimension',
      description: 'Create a new dimension/category.',
      inputSchema: createDimensionInputSchema
    },
    async ({ name, description, isPriority }) => {
      const dimension = dimensionService.createDimension({
        name,
        description,
        isPriority
      });

      return {
        content: [{ type: 'text', text: `Created dimension: ${dimension.dimension}` }],
        structuredContent: {
          success: true,
          dimension: dimension.dimension,
          message: `Created dimension: ${dimension.dimension}`
        }
      };
    }
  );

  server.registerTool(
    'rah_update_dimension',
    {
      title: 'Update RA-H dimension',
      description: 'Update or rename a dimension.',
      inputSchema: updateDimensionInputSchema
    },
    async ({ name, newName, description, isPriority }) => {
      const result = dimensionService.updateDimension({
        name,
        currentName: name,
        newName,
        description,
        isPriority
      });

      return {
        content: [{ type: 'text', text: `Updated dimension: ${result.dimension}` }],
        structuredContent: {
          success: true,
          dimension: result.dimension,
          message: `Updated dimension: ${result.dimension}`
        }
      };
    }
  );

  server.registerTool(
    'rah_delete_dimension',
    {
      title: 'Delete RA-H dimension',
      description: 'Delete a dimension and remove it from all nodes.',
      inputSchema: deleteDimensionInputSchema
    },
    async ({ name }) => {
      const result = dimensionService.deleteDimension(name);

      return {
        content: [{ type: 'text', text: `Deleted dimension: ${name}` }],
        structuredContent: {
          success: true,
          message: `Deleted dimension: ${name}`
        }
      };
    }
  );

  // Connect transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP server ready');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    log('Shutting down...');
    closeDatabase();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log('Shutting down...');
    closeDatabase();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('[ra-h-standalone] Fatal error:', error);
  process.exit(1);
});
