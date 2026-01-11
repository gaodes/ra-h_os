import { tool } from 'ai';
import { z } from 'zod';
import { nodeService } from '@/services/database/nodes';
import { edgeService } from '@/services/database/edges';

/**
 * Quick Link Tool - Creates edges to related nodes in ONE operation
 * No agent loop, no LLM reasoning - just fast database operations
 */
export const quickLinkTool = tool({
  description: 'Instantly find and link related nodes based on title/content matches. Fast - no AI reasoning, just database search and edge creation.',
  inputSchema: z.object({
    node_id: z.number().describe('The node ID to find connections for'),
    max_edges: z.number().optional().default(3).describe('Maximum edges to create (default 3)'),
  }),
  execute: async (params) => {
    const { node_id, max_edges = 3 } = params;
    try {
      // 1. Get the source node
      const sourceNode = await nodeService.getNodeById(node_id);
      if (!sourceNode) {
        return { success: false, error: `Node ${node_id} not found`, edgesCreated: 0 };
      }

      // 2. Extract search terms from title (split on common separators)
      const title = sourceNode.title || '';
      const searchTerms = extractSearchTerms(title);

      if (searchTerms.length === 0) {
        return {
          success: true,
          message: 'No searchable terms found in title',
          edgesCreated: 0,
          searchTerms: []
        };
      }

      // 3. Search for related nodes using each term
      const foundNodeIds = new Set<number>();
      const matchDetails: Array<{ nodeId: number; title: string; matchedTerm: string }> = [];

      for (const term of searchTerms.slice(0, 3)) { // Max 3 search terms
        const results = await nodeService.getNodes({
          search: term,
          limit: 10
        });

        for (const node of results) {
          // Skip self and already found
          if (node.id === node_id || foundNodeIds.has(node.id)) continue;

          foundNodeIds.add(node.id);
          matchDetails.push({
            nodeId: node.id,
            title: node.title || `Node ${node.id}`,
            matchedTerm: term
          });
        }
      }

      // 4. Get existing edges to avoid duplicates
      const existingConnections = await edgeService.getNodeConnections(node_id);
      const existingTargets = new Set(existingConnections.map(c => c.connected_node.id));

      // 5. Create edges for top matches (excluding existing)
      const edgesToCreate = matchDetails
        .filter(m => !existingTargets.has(m.nodeId))
        .slice(0, max_edges);

      const createdEdges: Array<{ toNodeId: number; toTitle: string }> = [];

      for (const match of edgesToCreate) {
        try {
          await edgeService.createEdge({
            from_node_id: node_id,
            to_node_id: match.nodeId,
            source: 'helper_name',
            context: { quickLink: true, matchedTerm: match.matchedTerm }
          });
          createdEdges.push({ toNodeId: match.nodeId, toTitle: match.title });
        } catch (err) {
          // Edge might already exist, continue
          console.warn(`[quickLink] Failed to create edge to ${match.nodeId}:`, err);
        }
      }

      // 6. Return summary
      const skippedCount = matchDetails.filter(m => existingTargets.has(m.nodeId)).length;

      return {
        success: true,
        sourceNode: { id: node_id, title: sourceNode.title },
        searchTerms,
        edgesCreated: createdEdges.length,
        edges: createdEdges,
        skippedExisting: skippedCount,
        totalMatches: matchDetails.length,
        message: createdEdges.length > 0
          ? `Linked to ${createdEdges.length} nodes: ${createdEdges.map(e => e.toTitle).join(', ')}`
          : skippedCount > 0
            ? `Found ${skippedCount} matches but edges already exist`
            : `No related nodes found for: ${searchTerms.join(', ')}`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Quick link failed',
        edgesCreated: 0
      };
    }
  },
});

/**
 * Extract meaningful search terms from a title
 * Looks for: names, quoted phrases, capitalized words, etc.
 */
function extractSearchTerms(title: string): string[] {
  const terms: string[] = [];

  // 1. Extract quoted phrases
  const quotedMatches = title.match(/["']([^"']+)["']/g);
  if (quotedMatches) {
    terms.push(...quotedMatches.map(m => m.replace(/["']/g, '').trim()));
  }

  // 2. Extract potential names (2-3 capitalized words in sequence)
  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g;
  let match;
  while ((match = namePattern.exec(title)) !== null) {
    const name = match[1];
    // Skip common non-name phrases
    if (!isCommonPhrase(name)) {
      terms.push(name);
    }
  }

  // 3. Extract standalone capitalized words (potential company/project names)
  const words = title.split(/\s+/);
  for (const word of words) {
    const cleaned = word.replace(/[^a-zA-Z0-9]/g, '');
    if (cleaned.length > 2 && /^[A-Z]/.test(cleaned) && !terms.includes(cleaned)) {
      terms.push(cleaned);
    }
  }

  // Dedupe and limit
  const unique = [...new Set(terms)].filter(t => t.length > 2);
  return unique.slice(0, 5);
}

function isCommonPhrase(phrase: string): boolean {
  const common = [
    'The', 'How', 'What', 'Why', 'When', 'Where', 'Which',
    'New', 'First', 'Last', 'Next', 'This', 'That',
    'Part', 'Chapter', 'Section', 'Episode'
  ];
  return common.some(c => phrase.startsWith(c + ' ') || phrase === c);
}
