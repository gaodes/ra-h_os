import { NextRequest, NextResponse } from 'next/server';
import { CostAnalytics } from '@/services/analytics/costs';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period') || 'week';
    const agent = searchParams.get('agent');
    const traceId = searchParams.get('trace_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (traceId) {
      const traceCosts = CostAnalytics.getCostsByTrace(traceId);
      return NextResponse.json(traceCosts);
    }

    if (agent) {
      const agentCosts = CostAnalytics.getCostsByAgent(
        agent,
        startDate || undefined,
        endDate || undefined
      );
      return NextResponse.json(agentCosts);
    }

    const days = period === 'day' ? 1 : period === 'week' ? 7 : period === 'month' ? 30 : 7;
    
    if (startDate && endDate) {
      const dateRangeCosts = CostAnalytics.getCostsByDateRange(startDate, endDate);
      return NextResponse.json(dateRangeCosts);
    }

    const now = new Date();
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const periodCosts = CostAnalytics.getCostsByDateRange(
      start.toISOString(),
      now.toISOString()
    );

    const cacheStats = CostAnalytics.getCacheEffectiveness(
      start.toISOString(),
      now.toISOString()
    );

    const dailyBreakdown = CostAnalytics.getDailyBreakdown(days);

    return NextResponse.json({
      period: period,
      summary: periodCosts,
      cache: cacheStats,
      daily: dailyBreakdown,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ [Analytics] Error:', errorMessage);
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
