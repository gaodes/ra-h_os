import { tool } from 'ai';
import { z } from 'zod';

export const embedContentTool = tool({
  description: 'Chunk and embed a node’s content so semantic search stays current',
  inputSchema: z.object({
    nodeId: z.number().describe('The ID of the node to process')
  }),
  execute: async ({ nodeId }) => {
    try {
      // Call the same API endpoint that the manual embed button uses
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/ingestion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId })
      });

      const result = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'Failed to embed content',
          data: null
        };
      }

      return {
        success: true,
        message: result.message || `Successfully chunked and embedded content for node ${nodeId}`,
        data: { nodeId }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to embed content',
        data: null
      };
    }
  }
});
