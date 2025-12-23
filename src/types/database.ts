// New Node-based type system replacing rigid Item categorization
export interface Node {
  id: number;
  title: string;
  description?: string;
  content?: string;           // Consolidated content from description + abstract + notes
  link?: string;
  type?: string;
  dimensions: string[];       // Flexible dimensions replacing type + stage + segment + tags
  embedding?: Buffer;         // Node-level embedding (BLOB data)
  chunk?: string;
  metadata?: any;            // Flexible metadata storage from extras + chunk_status + sub_type
  created_at: string;
  updated_at: string;
  is_pinned?: number;        // Legacy pin flag (read-only, slated for removal)
  edge_count?: number;       // Derived count of edges, included in some queries

  // Optional embedding fields (restored from migration)
  embedding_updated_at?: string;
  embedding_text?: string;
  chunk_status?: 'not_chunked' | 'chunking' | 'chunked' | 'error' | null;
}

// Legacy Item interface - DEPRECATED, use Node instead
// Kept temporarily for migration compatibility
export interface Item extends Node {
  // Legacy fields for backwards compatibility during transition
  description?: string;
  abstract?: string;
  type?: string;
  legacyType?: string[];
  stage?: string;
  segment?: string[];
  tags?: string[];
  sub_type?: any;
  notes?: any;
  extras?: any;
  score?: number;
  content_embedding?: number[];
  embedding_updated_at?: string;
  chunk_status?: 'not_chunked' | 'chunking' | 'chunked' | 'error';
  chunk_updated_at?: string;
}

export interface Chunk {
  id: number;
  node_id: number;           // Updated from item_id to node_id
  chunk_idx?: number;
  text: string;
  embedding?: number[];
  embedding_type: string;
  metadata?: any;            // Updated from extras to metadata
  created_at: string;
}

export interface Edge {
  id: number;
  from_node_id: number;
  to_node_id: number;
  context?: any;
  source: 'user' | 'ai_similarity' | 'helper_name';
  created_at: string;
}

export interface Chat {
  id: number;
  user_message?: string;
  assistant_message?: string;
  thread_id: string;
  focused_node_id?: number;  // Updated from focused_item_id
  metadata?: any;
  embedding?: number[];      // Renamed from content_embedding
  created_at: string;
}

export interface SessionContext {
  id: number;
  session_id: string;
  focused_node_id: number;   // Updated from focused_item_id
  context_data: any;
  created_at: string;
  last_accessed: string;
  expires_at: string;
}

export interface SessionCache {
  id: number;
  session_id: string;
  cache_key: string;
  cache_data: any;
  expires_at: string;
  created_at: string;
}

// New NodeFilters interface replacing rigid ItemFilters
export interface NodeFilters {
  dimensions?: string[];      // Filter by dimensions (replaces stage/type filtering)
  search?: string;           // Text search in title/content
  limit?: number;
  offset?: number;
  sortBy?: 'updated' | 'edges';  // Sort by updated_at or edge count
}

// Legacy filters - DEPRECATED, use NodeFilters instead
export interface ItemFilters extends NodeFilters {
  stage?: string;
  type?: string;
  tags?: string[];
}

export interface ChunkData {
  node_id: number;           // Updated from item_id
  chunk_idx?: number;
  text: string;
  embedding?: number[];
  embedding_type: string;
  metadata?: any;            // Updated from extras
}

export interface EdgeData {
  from_node_id: number;
  to_node_id: number;
  context?: any;
  source: 'user' | 'ai_similarity' | 'helper_name';
}

export interface ChatData {
  user_message?: string;
  assistant_message?: string;
  thread_id: string;
  focused_node_id?: number;  // Updated from focused_item_id
  metadata?: any;
  embedding?: number[];      // Renamed from content_embedding
}

export interface CachedContext {
  sessionId: string;
  focusedNodeId: number;     // Updated from focusedItemId
  contextData: any;
  expiresAt: string;
}

// New NodeConnection interface
export interface NodeConnection {
  id: number;
  connected_node: Node;      // Updated from connected_item
  edge: Edge;
}

// Legacy connection - DEPRECATED, use NodeConnection instead  
export interface ItemConnection {
  id: number;
  connected_item: Item;
  edge: Edge;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  max?: number;
}

export interface DatabaseError {
  message: string;
  code?: string;
  details?: any;
}

// Dimension interface for dimension management
export interface Dimension {
  name: string;
  description?: string | null;
  is_priority: boolean;
  updated_at: string;
}
