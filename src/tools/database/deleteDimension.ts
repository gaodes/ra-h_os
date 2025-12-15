import { tool } from 'ai';
import { z } from 'zod';

export const deleteDimensionTool = tool({
  description: 'Delete a dimension and remove all node associations',
  inputSchema: z.object({
    name: z.string().describe('Dimension name to delete')
  }),
  execute: async (params) => {
    console.log('🗑️ DeleteDimension tool called with params:', JSON.stringify(params, null, 2));
    try {
      const trimmedName = params.name.trim();
      if (!trimmedName) {
        return {
          success: false,
          error: 'Dimension name is required',
          data: null
        };
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/dimensions?name=${encodeURIComponent(trimmedName)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        let errorMessage = 'Failed to delete dimension';
        try {
          const errorResult = await response.json();
          errorMessage = errorResult.error || errorMessage;
        } catch {
          // If response is not JSON (e.g., HTML error page), use status text
          errorMessage = `Failed to delete dimension: ${response.status} ${response.statusText}`;
        }
        return {
          success: false,
          error: errorMessage,
          data: null
        };
      }

      const result = await response.json();

      return {
        success: true,
        data: result.data,
        message: `Deleted dimension "${trimmedName}" and removed all node associations`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete dimension',
        data: null
      };
    }
  }
});

