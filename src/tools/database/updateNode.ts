import { tool } from 'ai';
import { z } from 'zod';

export const updateNodeTool = tool({
  description: 'Update node fields',
  inputSchema: z.object({
    id: z.number().describe('The ID of the node to update'),
    updates: z.object({
      title: z.string().optional().describe('New title'),
      content: z.string().optional().describe('New content/description/notes'),
      link: z.string().optional().describe('New link'),
      dimensions: z.array(z.string()).optional().describe('New dimension tags - completely replaces existing dimensions'),
      chunk: z.string().optional().describe('New chunk content'),
      metadata: z.record(z.any()).optional().describe('New metadata - completely replaces existing metadata')
    }).describe('Object containing the fields to update')
  }),
  execute: async ({ id, updates }) => {
    try {
      if (!updates || Object.keys(updates).length === 0) {
        return {
          success: false,
          error: 'updateNode requires at least one field in the updates object.',
          data: null
        };
      }

      // FORCE APPEND for content field - fetch existing and append new content
      if (updates.content) {
        const fetchResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/nodes/${id}`);
        if (fetchResponse.ok) {
          const { node } = await fetchResponse.json();
          const existingContent = (node?.content || '').trim();
          const newContent = updates.content.trim();
          
          // Skip if new content is identical to existing (model sent duplicate)
          if (existingContent === newContent) {
            console.log(`[updateNode] ERROR - new content identical to existing (${existingContent.length} chars). Model should NOT call updateNode again.`);
            return {
              success: false,
              error: 'Content already up to date - do not call updateNode again. Move to next step.',
              data: null
            };
          }
          
          // Detect if adding a section that already exists (e.g., ## Integration Analysis)
          const newSectionMatch = newContent.match(/^##\s+(.+)$/m);
          if (newSectionMatch && existingContent) {
            const sectionHeader = newSectionMatch[0]; // e.g., "## Integration Analysis"
            if (existingContent.includes(sectionHeader)) {
              console.log(`[updateNode] ERROR - Section "${sectionHeader}" already exists in node`);
              return {
                success: false,
                error: `Section "${sectionHeader}" already exists in this node. Cannot append duplicate section.`,
                data: null
              };
            }
          }
          
          // Detect if model included existing content + new content
          if (existingContent && newContent.startsWith(existingContent)) {
            // Extract only the new part
            const actualNewContent = newContent.substring(existingContent.length).trim();
            console.log(`[updateNode] Model included existing content - extracting new part only (${actualNewContent.length} chars)`);
            const separator = existingContent.endsWith('\n\n') ? '' : '\n\n';
            updates.content = `${existingContent}${separator}${actualNewContent}`;
          } else if (existingContent) {
            // Normal append
            const separator = existingContent.endsWith('\n\n') ? '' : '\n\n';
            updates.content = `${existingContent}${separator}${newContent}`;
            console.log(`[updateNode] Appended content: ${existingContent.length} + ${newContent.length} = ${updates.content.length} chars`);
          } else {
            console.log(`[updateNode] No existing content, using new content as-is (${newContent.length} chars)`);
          }
        }
      }

      // No dimension validation - user has full control over dimensions

      // Call the nodes API endpoint
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/nodes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      const result = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'Failed to update node',
          data: null
        };
      }

      return {
        success: true,
        data: result.node,
        message: `Updated node ID ${id}${updates.dimensions ? ` with dimensions: ${updates.dimensions.join(', ')}` : ''}`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update node',
        data: null
        };
    }
  }
});

// Legacy export for backwards compatibility
export const updateItemTool = updateNodeTool;
