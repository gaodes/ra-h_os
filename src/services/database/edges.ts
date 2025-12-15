import { getSQLiteClient } from './sqlite-client';
import { Edge, EdgeData, NodeConnection, Node } from '@/types/database';
import { eventBroadcaster } from '../events';

export class EdgeService {
  async getEdges(): Promise<Edge[]> {
    const sqlite = getSQLiteClient();
    const result = sqlite.query<Edge>('SELECT * FROM edges ORDER BY created_at DESC');
    return result.rows;
  }

  async getEdgeById(id: number): Promise<Edge | null> {
    const sqlite = getSQLiteClient();
    const result = sqlite.query<Edge>('SELECT * FROM edges WHERE id = ?', [id]);
    return result.rows[0] || null;
  }

  async createEdge(edgeData: EdgeData): Promise<Edge> {
    return this.createEdgeSQLite(edgeData);
  }

  // PostgreSQL path removed in SQLite-only consolidation

  private async createEdgeSQLite(edgeData: EdgeData): Promise<Edge> {
    const now = new Date().toISOString();
    const sqlite = getSQLiteClient();
    
    const result = sqlite.prepare(`
      INSERT INTO edges (from_node_id, to_node_id, context, source, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      edgeData.from_node_id,
      edgeData.to_node_id,
      JSON.stringify(edgeData.context || {}),
      edgeData.source,
      now
    );

    const edgeId = Number(result.lastInsertRowid);
    const newEdge = await this.getEdgeById(edgeId);
    
    if (!newEdge) {
      throw new Error('Failed to create edge');
    }

    // Broadcast edge creation event
    eventBroadcaster.broadcast({
      type: 'EDGE_CREATED',
      data: { 
        fromNodeId: newEdge.from_node_id, 
        toNodeId: newEdge.to_node_id,
        edge: newEdge 
      }
    });

    return newEdge;
  }

  async updateEdge(id: number, updates: Partial<Edge>): Promise<Edge> {
    return this.updateEdgeSQLite(id, updates);
  }

  // PostgreSQL path removed in SQLite-only consolidation

  private async updateEdgeSQLite(id: number, updates: Partial<Edge>): Promise<Edge> {
    const sqlite = getSQLiteClient();
    const updateFields: string[] = [];
    const params: any[] = [];

    // Build dynamic update query
    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at' && value !== undefined) {
        updateFields.push(`${key} = ?`);
        if (key === 'context') {
          params.push(typeof value === 'object' ? JSON.stringify(value) : value);
        } else {
          params.push(value);
        }
      }
    });

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    params.push(id); // Add ID for WHERE clause

    const query = `UPDATE edges SET ${updateFields.join(', ')} WHERE id = ?`;
    const result = sqlite.query(query, params);
    
    if (result.changes === 0) {
      throw new Error(`Edge with ID ${id} not found`);
    }

    const updatedEdge = await this.getEdgeById(id);
    if (!updatedEdge) {
      throw new Error(`Failed to retrieve updated edge with ID ${id}`);
    }

    return updatedEdge;
  }

  async deleteEdge(id: number): Promise<void> {
    const sqlite = getSQLiteClient();
    const result = sqlite.query('DELETE FROM edges WHERE id = ?', [id]);
    if ((result.changes || 0) === 0) {
      throw new Error(`Edge with ID ${id} not found`);
    }
    // Broadcast edge deletion event
    eventBroadcaster.broadcast({
      type: 'EDGE_DELETED',
      data: { edgeId: id }
    });
  }

  async deleteEdgesByNodeId(nodeId: number): Promise<void> {
    const sqlite = getSQLiteClient();
    sqlite.query(
      'DELETE FROM edges WHERE from_node_id = ? OR to_node_id = ?',
      [nodeId, nodeId]
    );
  }

  async getNodeConnections(nodeId: number): Promise<NodeConnection[]> {
    return this.getNodeConnectionsSQLite(nodeId);
  }

  // PostgreSQL path removed in SQLite-only consolidation

  private async getNodeConnectionsSQLite(nodeId: number): Promise<NodeConnection[]> {
    const sqlite = getSQLiteClient();
    const result = sqlite.query(`
      SELECT 
        e.*,
        CASE 
          WHEN e.from_node_id = ? THEN n_to.id
          ELSE n_from.id
        END as connected_node_id,
        CASE 
          WHEN e.from_node_id = ? THEN n_to.title
          ELSE n_from.title
        END as connected_node_title,
        CASE 
          WHEN e.from_node_id = ? THEN n_to.content
          ELSE n_from.content
        END as connected_node_content,
        CASE 
          WHEN e.from_node_id = ? THEN n_to.link
          ELSE n_from.link
        END as connected_node_link,
        CASE 
          WHEN e.from_node_id = ? THEN n_to.chunk
          ELSE n_from.chunk
        END as connected_node_chunk,
        CASE 
          WHEN e.from_node_id = ? THEN n_to.metadata
          ELSE n_from.metadata
        END as connected_node_metadata,
        CASE 
          WHEN e.from_node_id = ? THEN n_to.created_at
          ELSE n_from.created_at
        END as connected_node_created_at,
        CASE 
          WHEN e.from_node_id = ? THEN n_to.updated_at
          ELSE n_from.updated_at
        END as connected_node_updated_at,
        CASE 
          WHEN e.from_node_id = ? THEN (
            SELECT JSON_GROUP_ARRAY(d.dimension) 
            FROM node_dimensions d WHERE d.node_id = n_to.id
          )
          ELSE (
            SELECT JSON_GROUP_ARRAY(d.dimension) 
            FROM node_dimensions d WHERE d.node_id = n_from.id
          )
        END as connected_node_dimensions_json
      FROM edges e
      LEFT JOIN nodes n_from ON e.from_node_id = n_from.id
      LEFT JOIN nodes n_to ON e.to_node_id = n_to.id
      WHERE e.from_node_id = ? OR e.to_node_id = ?
      ORDER BY e.created_at DESC
    `, [
      nodeId,
      nodeId,
      nodeId,
      nodeId,
      nodeId,
      nodeId,
      nodeId,
      nodeId,
      nodeId,
      nodeId,
      nodeId
    ]);

    return this.mapNodeConnectionsSQLite(result.rows);
  }

  private mapNodeConnections(rows: any[]): NodeConnection[] {
    return rows.map(row => {
      const edge: Edge = {
        id: row.id,
        from_node_id: row.from_node_id,
        to_node_id: row.to_node_id,
        context: row.context,
        source: row.source,
        created_at: row.created_at
      };

      const connected_node: Node = {
        id: row.connected_node_id,
        title: row.connected_node_title,
        content: row.connected_node_content,
        link: row.connected_node_link,
        dimensions: row.connected_node_dimensions,
        embedding: undefined, // Not needed for display
        chunk: row.connected_node_chunk,
        metadata: row.connected_node_metadata,
        created_at: row.connected_node_created_at,
        updated_at: row.connected_node_updated_at
      };

      return {
        id: edge.id,
        connected_node,
        edge
      };
    });
  }

  private mapNodeConnectionsSQLite(rows: any[]): NodeConnection[] {
    return rows.map(row => {
      let context: any = row.context;
      if (typeof row.context === 'string') {
        const trimmed = row.context.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            context = JSON.parse(trimmed);
          } catch (error) {
            console.warn('[edges] Failed to parse JSON context for edge', row.id, error);
            context = row.context;
          }
        }
      }

      const edge: Edge = {
        id: row.id,
        from_node_id: row.from_node_id,
        to_node_id: row.to_node_id,
        context,
        source: row.source,
        created_at: row.created_at
      };

      const connected_node: Node = {
        id: row.connected_node_id,
        title: row.connected_node_title,
        content: row.connected_node_content,
        link: row.connected_node_link,
        dimensions: JSON.parse(row.connected_node_dimensions_json || '[]'),
        embedding: undefined, // Not needed for display
        chunk: row.connected_node_chunk,
        metadata: typeof row.connected_node_metadata === 'string' ? JSON.parse(row.connected_node_metadata) : row.connected_node_metadata,
        created_at: row.connected_node_created_at,
        updated_at: row.connected_node_updated_at
      };

      return {
        id: edge.id,
        connected_node,
        edge
      };
    });
  }

  async edgeExists(fromId: number, toId: number): Promise<boolean> {
    const sqlite = getSQLiteClient();
    const result = sqlite.query('SELECT 1 FROM edges WHERE from_node_id = ? AND to_node_id = ?', [fromId, toId]);
    return result.rows.length > 0;
  }

  async getEdgeCount(): Promise<number> {
    const sqlite = getSQLiteClient();
    const result = sqlite.query('SELECT COUNT(*) as count FROM edges');
    return Number(result.rows[0].count);
  }


  async getMostConnectedNodes(limit = 10): Promise<Array<{ node_id: number; connection_count: number }>> {
    const sqlite = getSQLiteClient();
    const result = sqlite.query(`
      SELECT 
        node_id,
        COUNT(*) as connection_count
      FROM (
        SELECT from_node_id as node_id FROM edges
        UNION ALL
        SELECT to_node_id as node_id FROM edges
      ) combined
      GROUP BY node_id
      ORDER BY connection_count DESC
      LIMIT ?
    `, [limit]);

    return result.rows.map((row: any) => ({
      node_id: Number(row.node_id),
      connection_count: Number(row.connection_count)
    }));
  }

  async createBidirectionalEdge(fromId: number, toId: number, options?: {
    context?: any;
    source?: 'user' | 'ai_similarity' | 'helper_name';
  }): Promise<Edge[]> {
    const edges: Edge[] = [];

    // Create edge from A to B
    const forwardEdge = await this.createEdge({
      from_node_id: fromId,
      to_node_id: toId,
      context: options?.context,
      source: options?.source || 'ai_similarity'
    });
    edges.push(forwardEdge);

    // Create edge from B to A
    const backwardEdge = await this.createEdge({
      from_node_id: toId,
      to_node_id: fromId,
      context: options?.context,
      source: options?.source || 'ai_similarity'
    });
    edges.push(backwardEdge);

    return edges;
  }
}

// Export singleton instance
export const edgeService = new EdgeService();
