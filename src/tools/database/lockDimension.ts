import { tool } from 'ai';
import { z } from 'zod';

export const lockDimensionTool = tool({
  description: 'Lock a dimension to enable auto-assignment to new nodes',
  inputSchema: z.object({
    name: z.string().describe('Dimension name to lock')
  }),
  execute: async (params) => {
    console.log('🔒 LockDimension tool called with params:', JSON.stringify(params, null, 2));
    try {
      const trimmedName = params.name.trim();
      if (!trimmedName) {
        return {
          success: false,
          error: 'Dimension name is required',
          data: null
        };
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/dimensions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          isPriority: true
        })
      });

      if (!response.ok) {
        let errorMessage = 'Failed to lock dimension';
        try {
          const errorResult = await response.json();
          errorMessage = errorResult.error || errorMessage;
        } catch {
          // If response is not JSON (e.g., HTML error page), use status text
          errorMessage = `Failed to lock dimension: ${response.status} ${response.statusText}`;
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
        message: `Locked dimension "${trimmedName}" - it will now be auto-assigned to new nodes`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to lock dimension',
        data: null
      };
    }
  }
});

