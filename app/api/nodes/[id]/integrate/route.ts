import { NextRequest, NextResponse } from 'next/server';
import { nodeService, chunkService, edgeService } from '@/services/database';
import { EmbeddingService } from '@/services/embeddings';

export const runtime = 'nodejs';

const SIMILARITY_THRESHOLD = 0.6;
const TOP_K = 5;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const nodeId = parseInt(id, 10);

    if (isNaN(nodeId)) {
      return NextResponse.json({ success: false, error: 'Invalid node ID' }, { status: 400 });
    }

    const node = await nodeService.getNodeById(nodeId);
    if (!node) {
      return NextResponse.json({ success: false, error: 'Node not found' }, { status: 404 });
    }

    const queryText = node.chunk?.trim() || node.title;
    if (!queryText) {
      return NextResponse.json({ success: true, created: 0, skipped: 0, reason: 'no_content' });
    }

    const queryEmbedding = await EmbeddingService.generateQueryEmbedding(queryText);
    const similar = await chunkService.searchChunks(queryEmbedding, SIMILARITY_THRESHOLD, TOP_K);

    let created = 0;
    let skipped = 0;

    for (const match of similar) {
      if (match.node_id === nodeId) continue;

      const exists = await edgeService.edgeExists(nodeId, match.node_id);
      if (exists) { skipped++; continue; }

      await edgeService.createEdge({
        from_node_id: nodeId,
        to_node_id:   match.node_id,
        explanation:  `Semantically similar content (score: ${match.similarity.toFixed(3)})`,
        source:       'ai_similarity',
        created_via:  'workflow',
        skip_inference: true,
      });
      created++;
    }

    return NextResponse.json({ success: true, created, skipped });
  } catch (error) {
    console.error('[integrate] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Integration failed' },
      { status: 500 }
    );
  }
}
