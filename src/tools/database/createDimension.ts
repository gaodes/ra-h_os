import { tool } from 'ai';
import { z } from 'zod';

export const createDimensionTool = tool({
  description: 'Create a new dimension or update existing dimension. IMPORTANT: Always ask the user for a description explaining what belongs in this dimension before creating it. Dimensions without descriptions cannot be auto-assigned.',
  inputSchema: z.object({
    name: z.string().describe('Dimension name'),
    description: z.string().min(1).max(500).describe('Dimension description explaining what content belongs in this dimension (required, max 500 characters)'),
    isPriority: z.boolean().optional().describe('Whether to lock this dimension for auto-assignment (default: false)')
  }),
  execute: async (params) => {
    console.log('📁 CreateDimension tool called with params:', JSON.stringify(params, null, 2));
    try {
      const trimmedName = params.name.trim();
      if (!trimmedName) {
        return {
          success: false,
          error: 'Dimension name is required',
          data: null
        };
      }

      // Call POST /api/dimensions
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/dimensions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          description: params.description.trim(),
          isPriority: params.isPriority || false
        })
      });

      if (!response.ok) {
        let errorMessage = 'Failed to create dimension';
        try {
          const errorResult = await response.json();
          errorMessage = errorResult.error || errorMessage;
        } catch {
          // If response is not JSON (e.g., HTML error page), use status text
          errorMessage = `Failed to create dimension: ${response.status} ${response.statusText}`;
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
        message: `Created dimension "${trimmedName}"${params.isPriority ? ' (locked)' : ''}${params.description ? ' with description' : ''}`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create dimension',
        data: null
      };
    }
  }
});

