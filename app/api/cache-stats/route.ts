import { NextResponse } from 'next/server';
import type { CacheStats } from '@/types/prompts';

declare global {
  // eslint-disable-next-line no-var
  var lastCacheStats: CacheStats | undefined;
}

export async function GET() {
  try {
    const stats = global.lastCacheStats;
    
    if (!stats) {
      return NextResponse.json({
        error: 'No cache statistics available yet',
        message: 'Send a message to ra-h to generate cache stats'
      }, { status: 404 });
    }
    
    const hitRate = stats.cacheReadInputTokens > 0 ? 'HIT' : 'MISS';
    const totalInputTokens = stats.inputTokens + stats.cacheCreationInputTokens + stats.cacheReadInputTokens;
    
    // Cost calculation (Sonnet 4.5 pricing)
    const baseCost = 3.0; // $3 per million input tokens
    const writeCost = baseCost * 1.25; // $3.75 per million
    const readCost = baseCost * 0.1; // $0.30 per million
    
    const actualCost = (
      (stats.inputTokens * baseCost) +
      (stats.cacheCreationInputTokens * writeCost) +
      (stats.cacheReadInputTokens * readCost)
    ) / 1_000_000;
    
    const noCacheCost = (totalInputTokens * baseCost) / 1_000_000;
    const costSavingsPercentage = noCacheCost > 0 
      ? Math.round(((noCacheCost - actualCost) / noCacheCost) * 100)
      : 0;
    
    return NextResponse.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      lastRequest: {
        hitRate,
        tokens: {
          cacheWrite: stats.cacheCreationInputTokens,
          cacheRead: stats.cacheReadInputTokens,
          regular: stats.inputTokens,
          totalInput: totalInputTokens,
          output: stats.outputTokens
        },
        savings: {
          tokenPercentage: stats.savingsPercentage,
          costPercentage: costSavingsPercentage,
          actualCostUSD: actualCost.toFixed(6),
          noCacheCostUSD: noCacheCost.toFixed(6),
          savedUSD: (noCacheCost - actualCost).toFixed(6)
        }
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to fetch cache stats', details: errorMessage },
      { status: 500 }
    );
  }
}
