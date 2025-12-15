import { getSQLiteClient } from '@/services/database/sqlite-client';
import { getAutoContextSettings } from '@/services/settings/autoContextSettings';

interface AutoContextRow {
  id: number;
  title: string | null;
  updated_at: string;
  edge_count: number | null;
}

export interface AutoContextSummary {
  id: number;
  title: string;
  edgeCount: number;
  updatedAt: string;
}

function fetchAutoContextRows(limit: number): AutoContextSummary[] {
  const db = getSQLiteClient();
  const rows = db
    .query<AutoContextRow>(
      `
        SELECT n.id,
               n.title,
               n.updated_at,
               COUNT(DISTINCT e.id) AS edge_count
          FROM nodes n
          LEFT JOIN edges e
            ON (e.from_node_id = n.id OR e.to_node_id = n.id)
         WHERE n.type IS NULL OR n.type != 'memory'
         GROUP BY n.id
         ORDER BY edge_count DESC, n.updated_at DESC
         LIMIT ?
      `,
      [limit]
    )
    .rows;

  return rows.map((row) => ({
    id: row.id,
    title: row.title || 'Untitled node',
    updatedAt: row.updated_at,
    edgeCount: Number(row.edge_count ?? 0),
  }));
}

export function getAutoContextSummaries(limit = 10): AutoContextSummary[] {
  const settings = getAutoContextSettings();
  if (!settings.autoContextEnabled) {
    return [];
  }
  return fetchAutoContextRows(limit);
}

export function buildAutoContextBlock(limit = 10): string | null {
  const summaries = getAutoContextSummaries(limit);
  if (summaries.length === 0) {
    return null;
  }

  const lines: string[] = [
    '=== BACKGROUND CONTEXT ===',
    'Top 10 most-connected nodes (important knowledge hubs). Use queryNodes/getNodesById if relevant.',
    '',
  ];

  for (const summary of summaries) {
    lines.push(`[NODE:${summary.id}:"${summary.title}"] (edges: ${summary.edgeCount})`);
  }

  return lines.join('\n');
}
