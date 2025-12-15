import { tool } from 'ai';
import { z } from 'zod';

export const updateDimensionTool = tool({
  description: 'Update dimension name, description, or lock status',
  inputSchema: z.object({
    currentName: z.string().describe('Current dimension name'),
    newName: z.string().optional().describe('New dimension name (if renaming)'),
    description: z.string().max(500).optional().describe('New description (max 500 characters)'),
    isPriority: z.boolean().optional().describe('Lock/unlock status (true = locked, false = unlocked)')
  }),
  execute: async (params) => {
    console.log('📝 UpdateDimension tool called with params:', JSON.stringify(params, null, 2));
    try {
      // Validate at least one update field
      if (!params.newName && params.description === undefined && params.isPriority === undefined) {
        return {
          success: false,
          error: 'At least one update field (newName, description, or isPriority) must be provided',
          data: null
        };
      }

      // Handle rename + other updates
      const body: any = {
        currentName: params.currentName.trim(),
        description: params.description?.trim() || ''
      };
      
      if (params.newName) {
        body.newName = params.newName.trim();
      }

      if (params.isPriority !== undefined) {
        body.isPriority = params.isPriority;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/dimensions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        let errorMessage = 'Failed to update dimension';
        try {
          const errorResult = await response.json();
          errorMessage = errorResult.error || errorMessage;
        } catch {
          // If response is not JSON (e.g., HTML error page), use status text
          errorMessage = `Failed to update dimension: ${response.status} ${response.statusText}`;
        }
        return {
          success: false,
          error: errorMessage,
          data: null
        };
      }

      const result = await response.json();

      const updates = [];
      if (params.newName) updates.push(`renamed to "${params.newName}"`);
      if (params.description !== undefined) updates.push('description updated');
      if (params.isPriority !== undefined) updates.push(params.isPriority ? 'locked' : 'unlocked');

      return {
        success: true,
        data: result.data,
        message: `Updated dimension "${params.currentName}": ${updates.join(', ')}`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update dimension',
        data: null
      };
    }
  }
});

