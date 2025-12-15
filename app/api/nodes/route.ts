import { NextRequest, NextResponse } from 'next/server';
import { nodeService } from '@/services/database';
import { Node, NodeFilters } from '@/types/database';
import { autoEmbedQueue } from '@/services/embedding/autoEmbedQueue';
import { hasSufficientContent } from '@/services/embedding/constants';
import { DimensionService } from '@/services/database/dimensionService';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    const filters: NodeFilters = {
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0
    };

    // Handle dimensions parameter (comma-separated)
    const dimensionsParam = searchParams.get('dimensions');
    if (dimensionsParam) {
      filters.dimensions = dimensionsParam.split(',').map(dim => dim.trim()).filter(Boolean);
    }

    // Handle sortBy parameter
    const sortByParam = searchParams.get('sortBy');
    if (sortByParam === 'edges' || sortByParam === 'updated') {
      filters.sortBy = sortByParam;
    }

    const nodes = await nodeService.getNodes(filters);
    
    return NextResponse.json({
      success: true,
      data: nodes,
      count: nodes.length
    });
  } catch (error) {
    console.error('Error fetching nodes:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch nodes'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.title) {
      return NextResponse.json({
        success: false,
        error: 'Missing required field: title is required'
      }, { status: 400 });
    }

    const rawContent = typeof body.content === 'string' ? body.content : null;

    const providedDimensions = Array.isArray(body.dimensions) ? body.dimensions : [];
    const trimmedProvidedDimensions = providedDimensions
      .map((dim: unknown) => typeof dim === 'string' ? dim.trim() : '')
      .filter(Boolean)
      .slice(0, 5);

    // Auto-assign locked dimensions for all new nodes
    const autoAssignedDimensions = await DimensionService.assignLockedDimensions({
      title: body.title,
      content: rawContent || undefined,
      link: body.link
    });

    // Combine provided and auto-assigned dimensions, remove duplicates
    const finalDimensions = [...new Set([...trimmedProvidedDimensions, ...autoAssignedDimensions])]
      .slice(0, 5); // Ensure we don't exceed 5 total dimensions
    const rawChunk = typeof body.chunk === 'string' ? body.chunk : null;
    let chunkToStore = rawChunk;
    let chunkStatus: Node['chunk_status'];

    if (chunkToStore && chunkToStore.trim().length > 0) {
      chunkStatus = 'not_chunked';
    } else if (!chunkToStore && hasSufficientContent(rawContent)) {
      chunkToStore = rawContent;
      chunkStatus = 'not_chunked';
    }

    const node = await nodeService.createNode({
      title: body.title,
      content: rawContent ?? undefined,
      link: body.link,
      dimensions: finalDimensions,
      chunk: chunkToStore ?? undefined,
      chunk_status: chunkStatus,
      metadata: body.metadata || {}
    });

    if (chunkStatus === 'not_chunked' && node.id) {
      autoEmbedQueue.enqueue(node.id, { reason: 'node_created' });
    }

    return NextResponse.json({
      success: true,
      data: node,
      message: `Node created successfully with dimensions: ${finalDimensions.join(', ')}`
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating node:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create node'
    }, { status: 500 });
  }
}
