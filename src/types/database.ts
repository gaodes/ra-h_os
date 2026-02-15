// New Node-based type system replacing rigid Item categorization
export interface Node {
  id: number;
  title: string;
  description?: string;
  notes?: string;           // Consolidated content from description + abstract + notes
  link?: string;
  event_date?: string;
  dimensions: string[];       // Flexible dimensions replacing type + stage + segment + tags
  embedding?: Buffer;         // Node-level embedding (BLOB data)
  chunk?: string;
  metadata?: any;            // Flexible metadata storage from extras + chunk_status + sub_type
  created_at: string;
  updated_at: string;
        // Legacy pin flag (read-only, slated for removal)
  edge_count?: number;       // Derived count of edges, included in some queries

  // Optional embedding fields (restored from migration)
  embedding_updated_at?: string;
  embedding_text?: string;
  chunk_status?: 'not_chunked' | 'chunking' | 'chunked' | 'error' | null;
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
  source: EdgeSource;
  created_at: string;
}

export type EdgeSource = 'user' | 'ai_similarity' | 'helper_name';

export type EdgeContextType =
  | 'created_by'   // Content → Creator (book by author, podcast by host)
  | 'part_of'      // Part → Whole (episode of podcast, person discussed in book)
  | 'source_of'    // Derivative → Source (insight from article)
  | 'related_to';  // Default — anything else or when unsure

export type EdgeCreatedVia = 'ui' | 'agent' | 'mcp' | 'workflow' | 'quicklink' | 'quick_capture_auto';

export interface EdgeContext {
  // SYSTEM-INFERRED (AI classifies from explanation + nodes)
  type: EdgeContextType;
  confidence: number;   // 0-1
  inferred_at: string;  // ISO timestamp

  // PROVIDED AT CREATION / EDIT
  explanation: string;

  // SYSTEM-MANAGED
  created_via: EdgeCreatedVia;
}

// New NodeFilters interface replacing rigid ItemFilters
export interface NodeFilters {
  dimensions?: string[];      // Filter by dimensions (replaces stage/type filtering)
  search?: string;           // Text search in title/content
  limit?: number;
  offset?: number;
  sortBy?: 'updated' | 'edges';  // Sort by updated_at or edge count
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
  explanation: string;
  created_via: EdgeCreatedVia;
  source: EdgeSource;
  skip_inference?: boolean; // reserved for bulk imports / migrations
}

export interface ChatData {
  user_message?: string;
  assistant_message?: string;
  thread_id: string;
  focused_node_id?: number;  // Updated from focused_item_id
  metadata?: any;
  embedding?: number[];      // Renamed from content_embedding
}

// New NodeConnection interface
export interface NodeConnection {
  id: number;
  connected_node: Node;      // Updated from connected_item
  edge: Edge;
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
