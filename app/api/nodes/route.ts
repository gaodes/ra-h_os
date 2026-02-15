import { NextRequest, NextResponse } from 'next/server';
import { nodeService } from '@/services/database';
import { Node, NodeFilters } from '@/types/database';
import { autoEmbedQueue } from '@/services/embedding/autoEmbedQueue';
import { hasSufficientContent } from '@/services/embedding/constants';
import { DimensionService } from '@/services/database/dimensionService';
import { generateDescription } from '@/services/database/descriptionService';
import { scheduleAutoEdgeCreation } from '@/services/agents/autoEdge';

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

    // Handle dimensionsMatch parameter (any|all)
    const dimensionsMatchParam = searchParams.get('dimensionsMatch');
    if (dimensionsMatchParam === 'all') {
      filters.dimensionsMatch = 'all';
    }

    // Handle sortBy parameter (sortBy=edges|updated|created)
    const sortByParam = searchParams.get('sortBy');
    if (sortByParam === 'edges' || sortByParam === 'updated' || sortByParam === 'created' || sortByParam === 'event_date') {
      filters.sortBy = sortByParam;
    }

    // Also support sort=created_at|updated_at with order=asc|desc (used by feed)
    const sortParam = searchParams.get('sort');
    if (sortParam === 'created_at') {
      filters.sortBy = 'created';
    } else if (sortParam === 'updated_at') {
      filters.sortBy = 'updated';
    }

    const nodes = await nodeService.getNodes(filters);
    const total = await nodeService.countNodes(filters);

    return NextResponse.json({
      success: true,
      data: nodes,
      count: nodes.length,
      total
    });
  } catch (error) {
    console.error('Error fetching nodes:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch nodes'
    }, { status: 500 });
  }
}

// Weak-pattern regex for post-creation quality monitoring
const WEAK_PATTERNS = /\b(discusses|explores|examines|talks about|is about|delves into|This is a)\b/i;

function sanitizeTitle(title: string): string {
  let clean = title.trim();
  // Strip "Title: " prefix (extraction artifact)
  if (clean.startsWith('Title: ')) clean = clean.slice(7);
  // Strip trailing " / X" (Twitter artifact)
  if (clean.endsWith(' / X')) clean = clean.slice(0, -4);
  // Collapse whitespace
  clean = clean.replace(/\s+/g, ' ');
  return clean.slice(0, 160);
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

    // Sanitize title (strip extraction artifacts)
    body.title = sanitizeTitle(body.title);

    const rawNotes = typeof body.notes === 'string' ? body.notes : null;
    const eventDate = typeof body.event_date === 'string' ? body.event_date : null;

    // Process provided dimensions first (needed for description generation)
    const providedDimensions = Array.isArray(body.dimensions) ? body.dimensions : [];
    const trimmedProvidedDimensions = providedDimensions
      .map((dim: unknown) => typeof dim === 'string' ? dim.trim() : '')
      .filter(Boolean)
      .slice(0, 8);

    // Use provided description if present, otherwise auto-generate
    let nodeDescription: string | undefined = typeof body.description === 'string' && body.description.trim()
      ? body.description.trim().slice(0, 280)
      : undefined;

    if (!nodeDescription) {
      try {
        nodeDescription = await generateDescription({
          title: body.title,
          notes: rawNotes || undefined,
          link: body.link || undefined,
          metadata: body.metadata,
          dimensions: trimmedProvidedDimensions
        });
      } catch (error) {
        console.error('Error generating description:', error);
      }
    }

    // Final safety net — never store null/empty description
    if (!nodeDescription || nodeDescription.trim().length === 0) {
      nodeDescription = body.title.slice(0, 280);
    }

    // Monitor description quality
    if (nodeDescription && WEAK_PATTERNS.test(nodeDescription)) {
      console.warn(`[DescriptionQuality] Weak description for node "${body.title}": "${nodeDescription}"`);
    }

    // Auto-assign locked dimensions + keyword dimensions for all new nodes
    const { locked, keywords } = await DimensionService.assignDimensions({
      title: body.title,
      notes: rawNotes || undefined,
      link: body.link,
      description: nodeDescription
    });

    // Ensure keyword dimensions exist in the database (create if new)
    for (const keyword of keywords) {
      await DimensionService.ensureKeywordDimension(keyword);
    }

    // Combine provided, locked, and keyword dimensions, remove duplicates
    const finalDimensions = [...new Set([...trimmedProvidedDimensions, ...locked, ...keywords])]
      .slice(0, 8); // max 8 total
    const rawChunk = typeof body.chunk === 'string' ? body.chunk : null;
    let chunkToStore = rawChunk;
    let chunkStatus: Node['chunk_status'];

    if (chunkToStore && chunkToStore.trim().length > 0) {
      chunkStatus = 'not_chunked';
    } else if (!chunkToStore && hasSufficientContent(rawNotes)) {
      chunkToStore = rawNotes;
      chunkStatus = 'not_chunked';
    }

    const node = await nodeService.createNode({
      title: body.title,
      description: nodeDescription,
      notes: rawNotes ?? undefined,
      event_date: eventDate ?? undefined,
      link: body.link,
      dimensions: finalDimensions,
      chunk: chunkToStore ?? undefined,
      chunk_status: chunkStatus,
      metadata: body.metadata || {}
    });

    if (chunkStatus === 'not_chunked' && node.id && process.env.DISABLE_EMBEDDINGS !== 'true') {
      autoEmbedQueue.enqueue(node.id, { reason: 'node_created' });
    }

    // Schedule auto-edge creation (fire-and-forget, non-blocking)
    if (node.id) {
      scheduleAutoEdgeCreation(node.id);
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
