import { NextRequest, NextResponse } from 'next/server';
import { AgentDelegationService } from '@/services/agents/delegation';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const delegation = AgentDelegationService.getBySessionId(sessionId);
    if (!delegation) {
      return NextResponse.json({ error: 'Delegation not found' }, { status: 404 });
    }
    return NextResponse.json({ delegation });
  } catch (error) {
    console.error('Failed to fetch delegation:', error);
    return NextResponse.json({ error: 'Failed to fetch delegation' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const body = await request.json();
    const summary: string | undefined = body?.summary;
    const status: string | undefined = body?.status;

    if (!summary && !status) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const normalizedStatus = status && ['queued', 'in_progress', 'completed', 'failed'].includes(status)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (status as any)
      : undefined;

    const delegation = summary
      ? AgentDelegationService.completeDelegation(sessionId, summary, normalizedStatus ?? 'completed')
      : AgentDelegationService.markInProgress(sessionId);

    if (!delegation) {
      return NextResponse.json({ error: 'Delegation not found' }, { status: 404 });
    }

    return NextResponse.json({ delegation });
  } catch (error) {
    console.error('Failed to update delegation:', error);
    return NextResponse.json({ error: 'Failed to update delegation' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const deleted = AgentDelegationService.deleteDelegation(sessionId);
    if (!deleted) {
      return NextResponse.json({ error: 'Delegation not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete delegation:', error);
    return NextResponse.json({ error: 'Failed to delete delegation' }, { status: 500 });
  }
}
