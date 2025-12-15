import { getSQLiteClient } from './sqlite-client';
import { Chunk, ChunkData } from '@/types/database';

export class ChunkService {
  async getChunksByNodeId(nodeId: number): Promise<Chunk[]> {
    const sqlite = getSQLiteClient();
    const result = sqlite.query<Chunk>('SELECT * FROM chunks WHERE node_id = ? ORDER BY chunk_idx ASC', [nodeId]);
    return result.rows;
  }

  async getChunkById(id: number): Promise<Chunk | null> {
    const sqlite = getSQLiteClient();
    const result = sqlite.query<Chunk>('SELECT * FROM chunks WHERE id = ?', [id]);
    return result.rows[0] || null;
  }

  async createChunk(chunkData: ChunkData): Promise<Chunk> {
    return this.createChunkSQLite(chunkData);
  }

  // PostgreSQL path removed in SQLite-only consolidation

  private async createChunkSQLite(chunkData: ChunkData): Promise<Chunk> {
    const now = new Date().toISOString();
    const sqlite = getSQLiteClient();
    
    const result = sqlite.prepare(`
      INSERT INTO chunks (node_id, chunk_idx, text, embedding, embedding_type, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      chunkData.node_id,
      chunkData.chunk_idx || null,
      chunkData.text,
      chunkData.embedding || null,
      chunkData.embedding_type,
      chunkData.metadata ? JSON.stringify(chunkData.metadata) : null,
      now
    );

    const chunkId = Number(result.lastInsertRowid);
    const createdChunk = await this.getChunkById(chunkId);
    
    if (!createdChunk) {
      throw new Error('Failed to create chunk');
    }

    return createdChunk;
  }

  async createChunks(chunksData: ChunkData[]): Promise<Chunk[]> {
    if (chunksData.length === 0) {
      return [];
    }

    return this.createChunksSQLite(chunksData);
  }

  // PostgreSQL path removed in SQLite-only consolidation

  private async createChunksSQLite(chunksData: ChunkData[]): Promise<Chunk[]> {
    const sqlite = getSQLiteClient();
    const now = new Date().toISOString();
    const createdChunks: Chunk[] = [];

    // Use transaction for bulk insert
    sqlite.transaction(() => {
      const stmt = sqlite.prepare(`
        INSERT INTO chunks (node_id, chunk_idx, text, embedding, embedding_type, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const chunk of chunksData) {
        stmt.run(
          chunk.node_id,
          chunk.chunk_idx || null,
          chunk.text,
          chunk.embedding || null,
          chunk.embedding_type,
          chunk.metadata ? JSON.stringify(chunk.metadata) : null,
          now
        );
      }
    });

    // Get all created chunks by node_id (since we know they were just created)
    const nodeIds = [...new Set(chunksData.map(c => c.node_id))];
    for (const nodeId of nodeIds) {
      const chunks = await this.getChunksByNodeId(nodeId);
      createdChunks.push(...chunks.filter(c => c.created_at === now));
    }

    return createdChunks;
  }

  async updateChunk(id: number, updates: Partial<Chunk>): Promise<Chunk> {
    return this.updateChunkSQLite(id, updates);
  }

  // PostgreSQL path removed in SQLite-only consolidation

  private async updateChunkSQLite(id: number, updates: Partial<Chunk>): Promise<Chunk> {
    const sqlite = getSQLiteClient();
    const updateFields: string[] = [];
    const params: any[] = [];

    // Build dynamic update query
    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at' && value !== undefined) {
        updateFields.push(`${key} = ?`);
        if (key === 'metadata') {
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

    const query = `UPDATE chunks SET ${updateFields.join(', ')} WHERE id = ?`;
    const result = sqlite.query(query, params);
    
    if (result.changes === 0) {
      throw new Error(`Chunk with ID ${id} not found`);
    }

    const updatedChunk = await this.getChunkById(id);
    if (!updatedChunk) {
      throw new Error(`Failed to retrieve updated chunk with ID ${id}`);
    }

    return updatedChunk;
  }

  async deleteChunk(id: number): Promise<void> {
    const sqlite = getSQLiteClient();
    const result = sqlite.query('DELETE FROM chunks WHERE id = ?', [id]);
    if ((result.changes || 0) === 0) {
      throw new Error(`Chunk with ID ${id} not found`);
    }
  }

  async deleteChunksByNodeId(nodeId: number): Promise<void> {
    const sqlite = getSQLiteClient();
    sqlite.query('DELETE FROM chunks WHERE node_id = ?', [nodeId]);
  }

  async searchChunks(
    queryEmbedding: number[], 
    similarityThreshold = 0.5, 
    matchCount = 5,
    nodeIds?: number[],
    fallbackQuery?: string
  ): Promise<Array<Chunk & { similarity: number }>> {
    try {
      return await this.searchChunksSQLite(queryEmbedding, similarityThreshold, matchCount, nodeIds);
    } catch (error) {
      console.warn('Vector search failed, attempting text fallback:', error);
      if (fallbackQuery) {
        return await this.textSearchFallback(fallbackQuery, matchCount, nodeIds);
      }
      throw error;
    }
  }

  // PostgreSQL path removed in SQLite-only consolidation

  private async searchChunksSQLite(
    queryEmbedding: number[], 
    similarityThreshold = 0.5,
    matchCount = 5,
    nodeIds?: number[]
  ): Promise<Array<Chunk & { similarity: number }>> {
    const sqlite = getSQLiteClient();
    
    // Step 1: Determine vector search limit - more conservative approach
    let vectorLimit = 50; // Start smaller for efficiency
    
    if (nodeIds && nodeIds.length > 0) {
      // When searching specific nodes, get exact count and use reasonable multiplier
      const candidateCountQuery = `SELECT COUNT(*) as count FROM chunks WHERE node_id IN (${nodeIds.map(() => '?').join(',')})`;
      const candidateResult = sqlite.query<{count: number}>(candidateCountQuery, nodeIds);
      const candidateCount = Number(candidateResult.rows[0].count);
      
      // Use 2x the candidate count but cap at reasonable limits
      vectorLimit = Math.min(Math.max(candidateCount * 2, 50), 1000);
      console.log(`🔍 Node-scoped search: ${candidateCount} candidates, using vector limit ${vectorLimit}`);
    } else {
      // For global search, use adaptive limit based on expected results
      vectorLimit = Math.max(matchCount * 10, 50);
    }
    
    const startTime = Date.now();
    
    // Step 2: Use CTE-based query to avoid UNION ALL explosion
    const vectorString = `[${queryEmbedding.join(',')}]`;
    let query = `
      WITH vector_results AS (
        SELECT chunk_id, distance
        FROM vec_chunks
        WHERE embedding MATCH ?
        ORDER BY distance
        LIMIT ?
      )
      SELECT c.*, (1.0 / (1.0 + vr.distance)) AS similarity
      FROM vector_results vr
      JOIN chunks c ON c.id = vr.chunk_id
    `;
    
    const params: any[] = [vectorString, vectorLimit];
    const conditions = [];
    
    // Node ID filter if provided
    if (nodeIds && nodeIds.length > 0) {
      conditions.push(`c.node_id IN (${nodeIds.map(() => '?').join(',')})`);
      params.push(...nodeIds);
    }
    
    // Similarity threshold filter
    conditions.push(`(1.0 / (1.0 + vr.distance)) >= ?`);
    params.push(similarityThreshold);
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY similarity DESC LIMIT ?`;
    params.push(matchCount);

    const result = sqlite.query<Chunk & { similarity: number }>(query, params);
    const searchTime = Date.now() - startTime;
    
    console.log(`📊 Vector search: ${result.rows.length}/${vectorLimit} chunks, threshold=${similarityThreshold}, time=${searchTime}ms`);
    if (result.rows.length > 0) {
      console.log(`🎯 Top result: chunk ${result.rows[0].id} (similarity: ${result.rows[0].similarity.toFixed(3)})`);
    }
    
    return result.rows;
  }

  async textSearchFallback(
    query: string,
    matchCount = 5,
    nodeIds?: number[]
  ): Promise<Array<Chunk & { similarity: number }>> {
    const sqlite = getSQLiteClient();
    const startTime = Date.now();
    
    // Clean query for LIKE search
    const cleanQuery = query.trim().toLowerCase();
    const searchTerms = cleanQuery.split(/\s+/).filter(term => term.length > 2);
    
    if (searchTerms.length === 0) {
      return [];
    }
    
    // Build LIKE conditions for each term
    const likeConditions = searchTerms.map(() => 'LOWER(text) LIKE ?').join(' AND ');
    const likeParams = searchTerms.map(term => `%${term}%`);
    
    let textQuery = `
      SELECT *, 0.8 as similarity
      FROM chunks 
      WHERE ${likeConditions}
    `;
    
    const params = [...likeParams];
    
    // Add node filter if provided
    if (nodeIds && nodeIds.length > 0) {
      textQuery += ` AND node_id IN (${nodeIds.map(() => '?').join(',')})`;
      params.push(...nodeIds.map(String));
    }
    
    textQuery += ` ORDER BY LENGTH(text) ASC LIMIT ?`;
    params.push(String(matchCount));
    
    const result = sqlite.query<Chunk & { similarity: number }>(textQuery, params);
    const searchTime = Date.now() - startTime;
    
    console.log(`📝 Text fallback: ${result.rows.length} chunks found, time=${searchTime}ms`);
    
    return result.rows;
  }

  async getChunkCount(): Promise<number> {
    const sqlite = getSQLiteClient();
    const result = sqlite.query('SELECT COUNT(*) as count FROM chunks');
    return Number(result.rows[0].count);
  }

  async getChunkCountByNodeId(nodeId: number): Promise<number> {
    const sqlite = getSQLiteClient();
    const result = sqlite.query('SELECT COUNT(*) as count FROM chunks WHERE node_id = ?', [nodeId]);
    return Number(result.rows[0].count);
  }

  async getNodesWithChunks(): Promise<Array<{ node_id: number; chunk_count: number }>> {
    const sqlite = getSQLiteClient();
    const result = sqlite.query(`
      SELECT node_id, COUNT(*) as chunk_count
      FROM chunks 
      GROUP BY node_id
      ORDER BY chunk_count DESC
    `);
    return result.rows.map((row: any) => ({
      node_id: Number(row.node_id),
      chunk_count: Number(row.chunk_count)
    }));
  }

  async getChunksWithoutEmbeddings(): Promise<Chunk[]> {
    // In SQLite, chunk vectors live in vec_chunks; report chunks without corresponding vector rows
    const sqlite = getSQLiteClient();
    const result = sqlite.query<Chunk>(`
      SELECT c.*
      FROM chunks c
      LEFT JOIN vec_chunks v ON v.chunk_id = c.id
      WHERE v.chunk_id IS NULL
      ORDER BY c.created_at ASC
    `);
    return result.rows;
  }
}

// Export singleton instance
export const chunkService = new ChunkService();
