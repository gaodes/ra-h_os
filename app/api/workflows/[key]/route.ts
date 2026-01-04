import { NextRequest, NextResponse } from 'next/server';
import { saveWorkflow, deleteWorkflow, userWorkflowExists } from '@/services/workflows/workflowFileService';
import { WorkflowRegistry, BUNDLED_WORKFLOW_KEYS } from '@/services/workflows/registry';

// PUT /api/workflows/[key] - Create or update a workflow
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const body = await request.json();

    // Validate required fields
    if (!body.displayName || typeof body.displayName !== 'string') {
      return NextResponse.json(
        { success: false, error: 'displayName is required' },
        { status: 400 }
      );
    }

    if (!body.instructions || typeof body.instructions !== 'string') {
      return NextResponse.json(
        { success: false, error: 'instructions is required' },
        { status: 400 }
      );
    }

    // Save the workflow
    saveWorkflow({
      key,
      displayName: body.displayName.trim(),
      description: body.description?.trim() || '',
      instructions: body.instructions,
      enabled: body.enabled !== false,
      requiresFocusedNode: body.requiresFocusedNode !== false,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving workflow:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save workflow' },
      { status: 500 }
    );
  }
}

// DELETE /api/workflows/[key] - Delete a workflow (resets to default if bundled)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;

    // Check if user file exists
    if (!userWorkflowExists(key)) {
      // If it's a bundled workflow, nothing to delete
      if (BUNDLED_WORKFLOW_KEYS.has(key)) {
        return NextResponse.json(
          { success: false, error: 'Cannot delete bundled workflow (no user override exists)' },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'Workflow not found' },
        { status: 404 }
      );
    }

    const deleted = deleteWorkflow(key);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Failed to delete workflow' },
        { status: 500 }
      );
    }

    // If this was a bundled workflow, it will now fall back to default
    const isBundled = BUNDLED_WORKFLOW_KEYS.has(key);

    return NextResponse.json({
      success: true,
      resetToDefault: isBundled,
    });
  } catch (error) {
    console.error('Error deleting workflow:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete workflow' },
      { status: 500 }
    );
  }
}

// GET /api/workflows/[key] - Get a single workflow
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const workflow = await WorkflowRegistry.getWorkflowByKey(key);

    if (!workflow) {
      return NextResponse.json(
        { success: false, error: 'Workflow not found' },
        { status: 404 }
      );
    }

    // Include metadata about whether it's user-modified
    const hasUserOverride = userWorkflowExists(key);
    const isBundled = BUNDLED_WORKFLOW_KEYS.has(key);

    return NextResponse.json({
      success: true,
      data: {
        ...workflow,
        isBundled,
        hasUserOverride,
      },
    });
  } catch (error) {
    console.error('Error fetching workflow:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch workflow' },
      { status: 500 }
    );
  }
}
