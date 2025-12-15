import { NextResponse } from 'next/server';
import { WorkflowRegistry } from '@/services/workflows/registry';

export async function GET() {
  try {
    const workflows = await WorkflowRegistry.getAllWorkflows();
    return NextResponse.json({
      success: true,
      data: workflows,
    });
  } catch (error) {
    console.error('Error fetching workflows:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch workflows' },
      { status: 500 }
    );
  }
}
