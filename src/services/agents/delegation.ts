import { getSQLiteClient } from '@/services/database/sqlite-client';
import { eventBroadcaster } from '@/services/events';

export type DelegationStatus = 'queued' | 'in_progress' | 'completed' | 'failed';
export type DelegationAgentType = 'mini' | 'wise-rah';

export interface AgentDelegation {
  id: number;
  sessionId: string;
  task: string;
  context: string[];
  expectedOutcome?: string | null;
  status: DelegationStatus;
  summary?: string | null;
  agentType: DelegationAgentType;
  supabaseToken?: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToDelegation(row: any): AgentDelegation {
  return {
    id: row.id,
    sessionId: row.session_id,
    task: row.task,
    context: (() => {
      try {
        return row.context ? JSON.parse(row.context) : [];
      } catch {
        return [];
      }
    })(),
    expectedOutcome: row.expected_outcome,
    status: row.status as DelegationStatus,
    summary: row.summary,
    agentType: (row.agent_type || 'mini') as DelegationAgentType,
    supabaseToken: row.supabase_token ?? null,
    // SQLite CURRENT_TIMESTAMP is UTC, append 'Z' to parse correctly as UTC
    createdAt: row.created_at ? row.created_at.replace(' ', 'T') + 'Z' : row.created_at,
    updatedAt: row.updated_at ? row.updated_at.replace(' ', 'T') + 'Z' : row.updated_at,
  };
}

function ensureTable() {
  const db = getSQLiteClient();
  db.query(`
    CREATE TABLE IF NOT EXISTS agent_delegations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      task TEXT NOT NULL,
      context TEXT,
      expected_outcome TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      summary TEXT,
      agent_type TEXT NOT NULL DEFAULT 'mini',
      supabase_token TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Add agent_type column if it doesn't exist (migration)
  try {
    const stmt = db.prepare('SELECT 1 FROM agent_delegations LIMIT 0');
    const tableExists = stmt !== null;
    
    if (tableExists) {
      // Try to add the column, ignore if it already exists
      try {
        db.prepare(`ALTER TABLE agent_delegations ADD COLUMN agent_type TEXT NOT NULL DEFAULT 'mini'`).run();
        console.log('✅ Added agent_type column to agent_delegations table');
      } catch (alterError: any) {
        // Column already exists, ignore
        if (!alterError.message?.includes('duplicate column')) {
          console.warn('Migration warning:', alterError.message);
        }
      }

      try {
        db.prepare(`ALTER TABLE agent_delegations ADD COLUMN supabase_token TEXT`).run();
        console.log('✅ Added supabase_token column to agent_delegations table');
      } catch (alterError: any) {
        if (!alterError.message?.includes('duplicate column')) {
          console.warn('Migration warning:', alterError.message);
        }
      }
    }
  } catch (error: any) {
    // Table doesn't exist yet or other error - it will be created with the columns
    console.log('Table creation will include agent_type and supabase_token columns');
  }
}

export class AgentDelegationService {
  static createDelegation(input: { 
    task: string; 
    context?: string[]; 
    expectedOutcome?: string | null;
    agentType?: DelegationAgentType;
    supabaseToken?: string | null;
  }): AgentDelegation {
    ensureTable();
    const db = getSQLiteClient();
    const sessionId = `delegation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const contextJson = JSON.stringify(input.context ?? []);
    const agentType = input.agentType || 'mini';
    db.prepare(
      `INSERT INTO agent_delegations (session_id, task, context, expected_outcome, status, agent_type, supabase_token)
       VALUES (?, ?, ?, ?, 'queued', ?, ?)`
    ).run(
      sessionId,
      input.task,
      contextJson,
      input.expectedOutcome ?? null,
      agentType,
      input.supabaseToken ?? null
    );

    const row = db
      .prepare('SELECT * FROM agent_delegations WHERE session_id = ?')
      .get(sessionId);

    const delegation = rowToDelegation(row);
    eventBroadcaster.broadcast({ type: 'AGENT_DELEGATION_CREATED', data: { delegation } });
    return delegation;
  }

  static markInProgress(sessionId: string): AgentDelegation | null {
    ensureTable();
    const db = getSQLiteClient();
    db.prepare(
      `UPDATE agent_delegations
         SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP
       WHERE session_id = ? AND status = 'queued'`
    ).run(sessionId);
    const row = db.prepare('SELECT * FROM agent_delegations WHERE session_id = ?').get(sessionId);
    if (!row) return null;
    const delegation = rowToDelegation(row);
    eventBroadcaster.broadcast({ type: 'AGENT_DELEGATION_UPDATED', data: { delegation } });
    return delegation;
  }

  static touchDelegation(sessionId: string): void {
    // Update the timestamp to prevent cleanup from killing active delegations
    ensureTable();
    const db = getSQLiteClient();
    db.prepare(
      `UPDATE agent_delegations SET updated_at = CURRENT_TIMESTAMP WHERE session_id = ? AND status = 'in_progress'`
    ).run(sessionId);
  }

  static completeDelegation(sessionId: string, summary: string, status: DelegationStatus = 'completed'): AgentDelegation | null {
    ensureTable();
    const db = getSQLiteClient();
    db.prepare(
      `UPDATE agent_delegations
         SET status = ?, summary = ?, updated_at = CURRENT_TIMESTAMP, supabase_token = NULL
       WHERE session_id = ?`
    ).run(status, summary, sessionId);
    const row = db.prepare('SELECT * FROM agent_delegations WHERE session_id = ?').get(sessionId);
    if (!row) return null;
    const delegation = rowToDelegation(row);
    eventBroadcaster.broadcast({ type: 'AGENT_DELEGATION_UPDATED', data: { delegation } });
    return delegation;
  }

  static getBySessionId(sessionId: string): AgentDelegation | null {
    ensureTable();
    const db = getSQLiteClient();
    const row = db.prepare('SELECT * FROM agent_delegations WHERE session_id = ?').get(sessionId);
    return row ? rowToDelegation(row) : null;
  }

  static getDelegation(sessionId: string): AgentDelegation | null {
    return this.getBySessionId(sessionId);
  }

  static listActive({ includeCompleted = true, limit = 100 }: { includeCompleted?: boolean; limit?: number } = {}): AgentDelegation[] {
    ensureTable();
    const db = getSQLiteClient();
    // Load all delegations - user closes them manually from UI
    const rows = includeCompleted
      ? db.prepare(
          `SELECT * FROM agent_delegations
             ORDER BY updated_at DESC
             LIMIT ?`
        ).all(limit)
      : db.prepare(
          `SELECT * FROM agent_delegations
             WHERE status IN ('queued','in_progress')
             ORDER BY updated_at DESC
             LIMIT ?`
        ).all(limit);
    return rows.map(rowToDelegation);
  }

  static listRecent(limit = 20): AgentDelegation[] {
    ensureTable();
    const db = getSQLiteClient();
    const rows = db.prepare(
      `SELECT * FROM agent_delegations
         ORDER BY created_at DESC
         LIMIT ?`
    ).all(limit);
    return rows.map(rowToDelegation);
  }

  static deleteDelegation(sessionId: string): boolean {
    ensureTable();
    const db = getSQLiteClient();
    const result = db.prepare('DELETE FROM agent_delegations WHERE session_id = ?').run(sessionId);
    return result.changes > 0;
  }

  static cleanupStaleDelegations(timeoutMinutes = 15): number {
    ensureTable();
    const db = getSQLiteClient();
    const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();
    
    const result = db.prepare(`
      UPDATE agent_delegations
      SET status = 'failed', 
          summary = 'Task timed out (exceeded ${timeoutMinutes} minutes)',
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'in_progress' 
        AND updated_at < ?
    `).run(cutoffTime);
    
    const affectedCount = result.changes || 0;
    
    if (affectedCount > 0) {
      const rows = db.prepare(
        `SELECT * FROM agent_delegations WHERE status = 'failed' AND summary LIKE 'Task timed out%'`
      ).all();
      rows.forEach(row => {
        const delegation = rowToDelegation(row);
        eventBroadcaster.broadcast({ type: 'AGENT_DELEGATION_UPDATED', data: { delegation } });
      });
    }
    
    return affectedCount;
  }
}
