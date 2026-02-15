import { tool } from 'ai';
import { z } from 'zod';
import { formatNodeForChat } from '../infrastructure/nodeFormatter';

export const createNodeTool = tool({
  description: 'Create node with title/content/link and optional dimensions (locked dimensions auto-assigned)',
  inputSchema: z.object({
    title: z.string().describe('The title of the node'),
    description: z.string().max(280).optional().describe('WHAT this is + WHY it matters. Extremely concise. No "discusses/explores". Auto-generated if omitted.'),
    notes: z.string().optional().describe('The main notes or content for this node'),
    link: z.string().optional().describe('A URL link to the source'),
    event_date: z.string().optional().describe('ISO date string for time-anchored nodes (e.g. meetings, events)'),
    dimensions: z
      .array(z.string())
      .max(5)
      .optional()
      .describe('Optional dimension tags to apply to this node (0-5 items). Locked dimensions will be auto-assigned.'),
    chunk: z.string().optional().describe('Raw content for later processing - CRITICAL for extracted content from URLs'),
    metadata: z.record(z.any()).optional().describe('Additional metadata like source info, extraction details, etc.')
  }),
  execute: async (params) => {
    console.log('🎯 CreateNode tool called with params:', JSON.stringify(params, null, 2));
    try {
      const rawDimensions = params.dimensions || [];
      const trimmedDimensions = rawDimensions
        .map(d => typeof d === 'string' ? d.trim() : '')
        .filter(Boolean)
        .slice(0, 5); // Limit to 5 dimensions max

      // Call the nodes API endpoint
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, dimensions: trimmedDimensions })
      });

      const result = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'Failed to create node',
          data: null
        };
      }

      // Format the created node for chat display
      const formattedDisplay = formatNodeForChat({
        id: result.data.id,
        title: result.data.title,
        dimensions: result.data.dimensions || trimmedDimensions
      });

      return {
        success: true,
        data: {
          ...result.data,
          formatted_display: formattedDisplay
        },
        message: `Created node ${formattedDisplay} with dimensions: ${result.data.dimensions ? result.data.dimensions.join(', ') : 'auto-assigned'}`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create node',
        data: null
      };
    }
  }
});

// Legacy export for backwards compatibility
export const createItemTool = createNodeTool;
