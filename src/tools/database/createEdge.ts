import { tool } from 'ai';
import { z } from 'zod';
import { edgeService } from '@/services/database/edges';
import { nodeService } from '@/services/database/nodes';
import { formatNodeForChat } from '../infrastructure/nodeFormatter';

export const createEdgeTool = tool({
  description: 'Create directed relationship between nodes',
  inputSchema: z.object({
    from_node_id: z.number().describe('The ID of the source node (where the connection originates)'),
    to_node_id: z.number().describe('The ID of the target node (where the connection points to)'),
    context: z.record(z.any()).optional().describe('Additional context about this connection - can include explanation, relationship type, strength, notes, etc.'),
    source: z.enum(['user', 'ai', 'ai_similarity', 'helper_name']).default('ai').describe('Source of this edge - use "ai" for AI-created connections, "user" for manual connections, "ai_similarity" for similarity-based connections')
  }),
  execute: async (params) => {
    console.log('🔗 CreateEdge tool called with params:', JSON.stringify(params, null, 2));
    
    try {
      // Validate basic IDs
      if (!Number.isFinite(params.from_node_id) || params.from_node_id <= 0) {
        return {
          success: false,
          error: 'from_node_id must be a positive integer. Use queryNodes to confirm the source node ID before creating the edge.',
          data: null,
        };
      }

      if (!Number.isFinite(params.to_node_id) || params.to_node_id <= 0) {
        return {
          success: false,
          error: 'to_node_id must be a positive integer. Run queryNodes to fetch the target node ID before creating the edge.',
          data: null,
        };
      }

      if (params.from_node_id === params.to_node_id) {
        return {
          success: false,
          error: 'Cannot create edge from a node to itself',
          data: null
        };
      }

      const [fromNode, toNode] = await Promise.all([
        nodeService.getNodeById(params.from_node_id),
        nodeService.getNodeById(params.to_node_id)
      ]);

      if (!fromNode) {
        return {
          success: false,
          error: `Source node ${params.from_node_id} not found. Use queryNodes to confirm the ID before creating the edge.`,
          data: null
        };
      }

      if (!toNode) {
        return {
          success: false,
          error: `Target node ${params.to_node_id} not found. Run queryNodes to fetch the correct ID before creating the edge.`,
          data: null
        };
      }

      // Check if edge already exists
      const exists = await edgeService.edgeExists(params.from_node_id, params.to_node_id);
      if (exists) {
        return {
          success: false,
          error: `Edge already exists between node ${params.from_node_id} and node ${params.to_node_id}`,
          data: null
        };
      }

      // Normalize and create the edge
      const source = (() => {
        if (params.source === 'ai') return 'helper_name';
        if (params.source === 'helper_name') return 'helper_name';
        if (params.source === 'ai_similarity') return 'ai_similarity';
        if (params.source === 'user') return 'user';
        return 'helper_name';
      })();

      const newEdge = await edgeService.createEdge({
        from_node_id: params.from_node_id,
        to_node_id: params.to_node_id,
        context: params.context || {},
        source
      });

      const fromLabel = formatNodeForChat({
        id: fromNode.id,
        title: fromNode.title,
        dimensions: fromNode.dimensions || []
      });

      const toLabel = formatNodeForChat({
        id: toNode.id,
        title: toNode.title,
        dimensions: toNode.dimensions || []
      });

      return {
        success: true,
        data: newEdge,
        message: `Created edge connection from ${fromLabel} to ${toLabel}`,
        formatted_labels: {
          from: fromLabel,
          to: toLabel
        }
      };
    } catch (error) {
      console.error('CreateEdge tool error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create edge',
        data: null
      };
    }
  }
});
