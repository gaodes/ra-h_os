import { getSQLiteClient } from '@/services/database/sqlite-client';
import { CostReport, TraceCostSummary, CacheEffectiveness } from '@/types/analytics';

export class CostAnalytics {
  static getCostsByDateRange(startDate: string, endDate: string): CostReport {
    const db = getSQLiteClient();
    
    const chats = db.prepare(`
      SELECT 
        id,
        helper_name,
        metadata,
        created_at
      FROM chats
      WHERE created_at >= ? AND created_at <= ?
    `).all(startDate, endDate) as Array<{
      id: number;
      helper_name: string;
      metadata: string;
      created_at: string;
    }>;

    let totalCostUsd = 0;
    let totalTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;
    let cacheHitCount = 0;
    let cacheSavingsUsd = 0;

    const costByAgent: Record<string, { costUsd: number; chats: number; tokens: number }> = {};
    const costByModel: Record<string, { costUsd: number; chats: number; tokens: number }> = {};

    for (const chat of chats) {
      let metadata: any = {};
      try {
        metadata = JSON.parse(chat.metadata || '{}');
      } catch (e) {
        continue;
      }

      const costUsd = metadata.estimated_cost_usd || 0;
      const tokens = metadata.total_tokens || 0;
      const inputToks = metadata.input_tokens || 0;
      const outputToks = metadata.output_tokens || 0;
      const cacheRead = metadata.cache_read_tokens || 0;
      const cacheWrite = metadata.cache_write_tokens || 0;
      const cacheHit = metadata.cache_hit || false;
      const model = metadata.model_used || 'unknown';

      totalCostUsd += costUsd;
      totalTokens += tokens;
      inputTokens += inputToks;
      outputTokens += outputToks;
      cacheReadTokens += cacheRead;
      cacheWriteTokens += cacheWrite;
      if (cacheHit) cacheHitCount++;

      if (metadata.cache_savings_pct && cacheHit) {
        const fullCost = costUsd / (1 - (metadata.cache_savings_pct / 100));
        cacheSavingsUsd += (fullCost - costUsd);
      }

      if (!costByAgent[chat.helper_name]) {
        costByAgent[chat.helper_name] = { costUsd: 0, chats: 0, tokens: 0 };
      }
      costByAgent[chat.helper_name].costUsd += costUsd;
      costByAgent[chat.helper_name].chats += 1;
      costByAgent[chat.helper_name].tokens += tokens;

      if (!costByModel[model]) {
        costByModel[model] = { costUsd: 0, chats: 0, tokens: 0 };
      }
      costByModel[model].costUsd += costUsd;
      costByModel[model].chats += 1;
      costByModel[model].tokens += tokens;
    }

    const cacheRequests = chats.filter(c => {
      try {
        const meta = JSON.parse(c.metadata || '{}');
        return meta.provider === 'anthropic';
      } catch {
        return false;
      }
    }).length;

    return {
      periodStart: startDate,
      periodEnd: endDate,
      totalCostUsd: parseFloat(totalCostUsd.toFixed(6)),
      totalChats: chats.length,
      totalTokens,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      cacheHitRate: cacheRequests > 0 ? cacheHitCount / cacheRequests : 0,
      cacheSavingsUsd: parseFloat(cacheSavingsUsd.toFixed(6)),
      avgCostPerChat: chats.length > 0 ? parseFloat((totalCostUsd / chats.length).toFixed(6)) : 0,
      avgTokensPerChat: chats.length > 0 ? Math.round(totalTokens / chats.length) : 0,
      costByAgent,
      costByModel,
    };
  }

  static getCostsByAgent(agentName: string, startDate?: string, endDate?: string): CostReport {
    const db = getSQLiteClient();
    
    let query = `
      SELECT 
        id,
        helper_name,
        metadata,
        created_at
      FROM chats
      WHERE helper_name = ?
    `;
    const params: any[] = [agentName];

    if (startDate && endDate) {
      query += ` AND created_at >= ? AND created_at <= ?`;
      params.push(startDate, endDate);
    }

    const chats = db.prepare(query).all(...params) as Array<{
      id: number;
      helper_name: string;
      metadata: string;
      created_at: string;
    }>;

    if (chats.length === 0) {
      return {
        periodStart: startDate || '',
        periodEnd: endDate || '',
        totalCostUsd: 0,
        totalChats: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cacheHitRate: 0,
        cacheSavingsUsd: 0,
        avgCostPerChat: 0,
        avgTokensPerChat: 0,
        costByAgent: {},
        costByModel: {},
      };
    }

    const start = startDate || chats[chats.length - 1].created_at;
    const end = endDate || chats[0].created_at;

    return this.getCostsByDateRange(start, end);
  }

  static getCostsByTrace(traceId: string): TraceCostSummary {
    const db = getSQLiteClient();
    
    const chats = db.prepare(`
      SELECT 
        id,
        helper_name,
        agent_type,
        metadata,
        created_at
      FROM chats
      WHERE json_extract(metadata, '$.trace_id') = ?
      ORDER BY created_at ASC
    `).all(traceId) as Array<{
      id: number;
      helper_name: string;
      agent_type: string;
      metadata: string;
      created_at: string;
    }>;

    let totalCostUsd = 0;
    let orchestratorCost = 0;
    let executorCost = 0;
    let plannerCost = 0;
    let totalTokens = 0;

    const interactions: TraceCostSummary['interactions'] = [];

    for (const chat of chats) {
      let metadata: any = {};
      try {
        metadata = JSON.parse(chat.metadata || '{}');
      } catch (e) {
        continue;
      }

      const costUsd = metadata.estimated_cost_usd || 0;
      const tokens = metadata.total_tokens || 0;

      totalCostUsd += costUsd;
      totalTokens += tokens;

      if (chat.agent_type === 'orchestrator') {
        orchestratorCost += costUsd;
      } else if (chat.agent_type === 'executor') {
        executorCost += costUsd;
      } else if (chat.agent_type === 'planner') {
        plannerCost += costUsd;
      }

      interactions.push({
        chatId: chat.id,
        agentName: chat.helper_name,
        costUsd: parseFloat(costUsd.toFixed(6)),
        tokens,
        createdAt: chat.created_at,
      });
    }

    return {
      traceId,
      totalCostUsd: parseFloat(totalCostUsd.toFixed(6)),
      chatCount: chats.length,
      orchestratorCost: parseFloat(orchestratorCost.toFixed(6)),
      executorCost: parseFloat(executorCost.toFixed(6)),
      plannerCost: parseFloat(plannerCost.toFixed(6)),
      totalTokens,
      interactions,
    };
  }

  static getCacheEffectiveness(startDate?: string, endDate?: string): CacheEffectiveness {
    const db = getSQLiteClient();
    
    let query = `
      SELECT 
        metadata
      FROM chats
      WHERE json_extract(metadata, '$.provider') = 'anthropic'
    `;
    const params: any[] = [];

    if (startDate && endDate) {
      query += ` AND created_at >= ? AND created_at <= ?`;
      params.push(startDate, endDate);
    }

    const chats = db.prepare(query).all(...params) as Array<{ metadata: string }>;

    let totalRequests = 0;
    let cacheHits = 0;
    let cacheMisses = 0;
    let totalCacheSavingsUsd = 0;
    let totalTokensSaved = 0;

    for (const chat of chats) {
      let metadata: any = {};
      try {
        metadata = JSON.parse(chat.metadata || '{}');
      } catch (e) {
        continue;
      }

      totalRequests++;

      if (metadata.cache_hit) {
        cacheHits++;
        const cacheReadTokens = metadata.cache_read_tokens || 0;
        totalTokensSaved += cacheReadTokens;

        if (metadata.cache_savings_pct && metadata.estimated_cost_usd) {
          const fullCost = metadata.estimated_cost_usd / (1 - (metadata.cache_savings_pct / 100));
          totalCacheSavingsUsd += (fullCost - metadata.estimated_cost_usd);
        }
      } else {
        cacheMisses++;
      }
    }

    return {
      totalRequests,
      cacheHits,
      cacheMisses,
      hitRate: totalRequests > 0 ? parseFloat((cacheHits / totalRequests).toFixed(4)) : 0,
      totalCacheSavingsUsd: parseFloat(totalCacheSavingsUsd.toFixed(6)),
      avgSavingsPerHit: cacheHits > 0 ? parseFloat((totalCacheSavingsUsd / cacheHits).toFixed(6)) : 0,
      totalTokensSaved,
    };
  }

  static getDailyBreakdown(days: number = 7): Array<{ date: string; cost: number; chats: number; tokens: number }> {
    const db = getSQLiteClient();
    
    const result = db.prepare(`
      SELECT 
        DATE(created_at) as date,
        SUM(COALESCE(json_extract(metadata, '$.estimated_cost_usd'), 0)) as cost,
        COUNT(*) as chats,
        SUM(COALESCE(json_extract(metadata, '$.total_tokens'), 0)) as tokens
      FROM chats
      WHERE created_at >= DATE('now', '-' || ? || ' days')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `).all(days) as Array<{ date: string; cost: number; chats: number; tokens: number }>;

    return result.map(row => ({
      date: row.date,
      cost: parseFloat(Number(row.cost).toFixed(6)),
      chats: Number(row.chats),
      tokens: Number(row.tokens),
    }));
  }
}
