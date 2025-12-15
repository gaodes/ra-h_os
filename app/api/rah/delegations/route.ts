import { NextRequest, NextResponse } from 'next/server';
import { AgentDelegationService } from '@/services/agents/delegation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    
    const includeCompleted = searchParams.get('includeCompleted') === 'true'
      || statusFilter !== 'active';
    const delegations = statusFilter === 'active'
      ? AgentDelegationService.listActive({ includeCompleted })
      : AgentDelegationService.listRecent();

    return NextResponse.json({ delegations });
  } catch (error) {
    console.error('Failed to list delegations:', error);
    return NextResponse.json({ error: 'Failed to load delegations' }, { status: 500 });
  }
}
