import { NextRequest, NextResponse } from 'next/server';
import { nodeService } from '@/services/database';
import { generateDescription } from '@/services/database/descriptionService';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const nodeId = parseInt(id, 10);

    if (isNaN(nodeId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid node ID'
      }, { status: 400 });
    }

    const node = await nodeService.getNodeById(nodeId);

    if (!node) {
      return NextResponse.json({
        success: false,
        error: 'Node not found'
      }, { status: 404 });
    }

    // Generate new description using the description service
    const newDescription = await generateDescription({
      title: node.title,
      content: node.content || undefined,
      link: node.link || undefined,
      metadata: node.metadata as { source?: string; channel_name?: string; author?: string; site_name?: string } | undefined,
      type: (node.metadata as { type?: string } | null)?.type,
      dimensions: node.dimensions || []
    });

    // Update the node with the new description
    const updatedNode = await nodeService.updateNode(nodeId, {
      description: newDescription
    });

    return NextResponse.json({
      success: true,
      node: updatedNode,
      description: newDescription,
      message: 'Description regenerated successfully'
    });
  } catch (error) {
    console.error('Error regenerating description:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to regenerate description'
    }, { status: 500 });
  }
}
