import { NextRequest, NextResponse } from 'next/server';
import { AgentDelegationService } from '@/services/agents/delegation';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const body = await request.json();
    const summary: string | undefined = body?.summary;
    const status: string | undefined = body?.status;

    if (!summary) {
      return NextResponse.json({ error: 'Summary is required' }, { status: 400 });
    }

    const normalizedStatus = status && ['queued', 'in_progress', 'completed', 'failed'].includes(status)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (status as any)
      : 'completed';

    const delegation = AgentDelegationService.completeDelegation(sessionId, summary, normalizedStatus);
    if (!delegation) {
      return NextResponse.json({ error: 'Delegation not found' }, { status: 404 });
    }

    return NextResponse.json({ delegation });
  } catch (error) {
    console.error('Failed to store delegation summary:', error);
    return NextResponse.json({ error: 'Failed to store delegation summary' }, { status: 500 });
  }
}
