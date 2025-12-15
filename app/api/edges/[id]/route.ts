import { NextRequest, NextResponse } from 'next/server';
import { edgeService } from '@/services/database';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const edgeId = parseInt(id, 10);
    
    if (isNaN(edgeId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid edge ID'
      }, { status: 400 });
    }
    
    const edge = await edgeService.getEdgeById(edgeId);
    
    if (!edge) {
      return NextResponse.json({
        success: false,
        error: 'Edge not found'
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      data: edge
    });
  } catch (error) {
    console.error('Error fetching edge:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch edge'
    }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const edgeId = parseInt(id, 10);
    
    if (isNaN(edgeId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid edge ID'
      }, { status: 400 });
    }

    const body = await request.json();
    
    // Validate source value if provided
    if (body.source && !['user', 'ai_similarity', 'helper_name'].includes(body.source)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid source: must be user, ai_similarity, or helper_name'
      }, { status: 400 });
    }

    const edge = await edgeService.updateEdge(edgeId, body);

    return NextResponse.json({
      success: true,
      data: edge,
      message: `Edge updated successfully`
    });
  } catch (error) {
    console.error('Error updating edge:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update edge'
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const edgeId = parseInt(id, 10);
    
    if (isNaN(edgeId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid edge ID'
      }, { status: 400 });
    }

    await edgeService.deleteEdge(edgeId);

    return NextResponse.json({
      success: true,
      message: `Edge ${edgeId} deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting edge:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete edge'
    }, { status: 500 });
  }
}