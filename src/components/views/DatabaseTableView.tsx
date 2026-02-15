"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Filter, ChevronDown, ChevronLeft, ChevronRight, X, ArrowUpDown, Search, ExternalLink } from 'lucide-react';
import type { Node } from '@/types/database';

type SortOrder = 'updated' | 'edges' | 'created' | 'event_date';

const SORT_LABELS: Record<SortOrder, string> = {
  updated: 'Recently Updated',
  edges: 'Most Edges',
  created: 'Creation Date',
  event_date: 'Event Date',
};

const PAGE_SIZE = 50;

interface DimensionSummary {
  dimension: string;
  count: number;
  isPriority: boolean;
}

interface DatabaseTableViewProps {
  onNodeClick: (nodeId: number) => void;
  refreshToken?: number;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.floor(months / 12)}y ago`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '\u2014';
  try {
    return dateStr.slice(0, 10);
  } catch {
    return '\u2014';
  }
}

export default function DatabaseTableView({ onNodeClick, refreshToken = 0 }: DatabaseTableViewProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<SortOrder>('updated');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [dimensions, setDimensions] = useState<DimensionSummary[]>([]);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [filterSearchQuery, setFilterSearchQuery] = useState('');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const filterPickerRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  const sortedDimensions = useMemo(() => {
    return [...dimensions].sort((a, b) => {
      if (a.isPriority && !b.isPriority) return -1;
      if (!a.isPriority && b.isPriority) return 1;
      return a.dimension.localeCompare(b.dimension);
    });
  }, [dimensions]);

  const filterPickerDimensions = sortedDimensions.filter(d =>
    d.dimension.toLowerCase().includes(filterSearchQuery.toLowerCase())
  );

  // Fetch dimensions
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/dimensions');
        const data = await res.json();
        if (data.success) setDimensions(data.data || []);
      } catch (e) {
        console.error('Error fetching dimensions:', e);
      }
    })();
  }, [refreshToken]);

  // Fetch nodes
  const fetchNodes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
        sortBy: sortOrder,
      });
      if (activeSearch) params.set('search', activeSearch);
      if (selectedFilters.length > 0) {
        params.set('dimensions', selectedFilters.join(','));
        params.set('dimensionsMatch', 'all');
      }

      const res = await fetch(`/api/nodes?${params}`);
      const data = await res.json();
      if (data.success) {
        setNodes(data.data || []);
        setTotal(data.total ?? data.count ?? 0);
      }
    } catch (e) {
      console.error('Error fetching nodes:', e);
    } finally {
      setLoading(false);
    }
  }, [page, sortOrder, activeSearch, selectedFilters]);

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes, refreshToken]);

  // Reset to page 1 when filters/sort/search change
  const filtersKey = selectedFilters.join(',');
  useEffect(() => {
    setPage(1);
  }, [sortOrder, activeSearch, filtersKey]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showFilterPicker && filterPickerRef.current && !filterPickerRef.current.contains(e.target as HTMLElement)) {
        setShowFilterPicker(false);
        setFilterSearchQuery('');
      }
      if (showSortDropdown && sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as HTMLElement)) {
        setShowSortDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilterPicker, showSortDropdown]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchQuery);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startItem = (page - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(page * PAGE_SIZE, total);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'transparent' }}>
      {/* Compact toolbar */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid #1a1a1a',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        {/* Search */}
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: '#0d0d0d',
            border: '1px solid #222',
            borderRadius: '6px',
            padding: '0 8px',
            gap: '6px',
          }}>
            <Search size={12} style={{ color: '#555', flexShrink: 0 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search nodes..."
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f0f0f0',
                fontSize: '12px',
                padding: '5px 0',
                outline: 'none',
                width: '140px',
              }}
            />
            {activeSearch && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setActiveSearch(''); }}
                style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', padding: 0, display: 'flex' }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        </form>

        {/* Filter chips + button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, flexWrap: 'wrap' }}>
          {selectedFilters.map(f => (
            <div key={f} style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '2px 7px',
              background: 'rgba(34, 197, 94, 0.06)',
              border: '1px solid rgba(34, 197, 94, 0.12)',
              borderRadius: '4px', fontSize: '11px', color: '#5a9'
            }}>
              {f}
              <button
                onClick={() => setSelectedFilters(selectedFilters.filter(x => x !== f))}
                style={{ background: 'transparent', border: 'none', color: '#5a9', cursor: 'pointer', padding: 0, display: 'flex' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#5a9'; }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
          <div style={{ position: 'relative' }} ref={filterPickerRef}>
            <button
              onClick={() => setShowFilterPicker(!showFilterPicker)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '4px 7px', background: 'transparent',
                border: '1px solid #222', borderRadius: '5px',
                color: '#888', fontSize: '11px', cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Filter size={11} />
              Filter
            </button>

            {showFilterPicker && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: '4px',
                background: '#141414', border: '1px solid #222', borderRadius: '10px',
                padding: '6px', minWidth: '220px', maxHeight: '320px', overflowY: 'auto',
                zIndex: 1000, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                <input
                  type="text"
                  value={filterSearchQuery}
                  onChange={(e) => setFilterSearchQuery(e.target.value)}
                  placeholder="Search dimensions..."
                  autoFocus
                  style={{
                    width: '100%', padding: '7px 10px', background: '#0d0d0d',
                    border: '1px solid transparent', borderRadius: '6px',
                    color: '#f0f0f0', fontSize: '12px', marginBottom: '4px', outline: 'none',
                  }}
                />
                {filterPickerDimensions.length === 0 ? (
                  <div style={{ padding: '12px', color: '#666', fontSize: '12px', textAlign: 'center' }}>
                    No matching dimensions
                  </div>
                ) : (
                  filterPickerDimensions.map(d => (
                    <button
                      key={d.dimension}
                      onClick={() => {
                        if (!selectedFilters.includes(d.dimension)) {
                          setSelectedFilters([...selectedFilters, d.dimension]);
                        }
                        setShowFilterPicker(false);
                        setFilterSearchQuery('');
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        width: '100%', padding: '7px 10px', background: 'transparent',
                        border: 'none', borderRadius: '5px', color: '#ccc',
                        fontSize: '12px', cursor: 'pointer', textAlign: 'left',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span>{d.dimension}</span>
                      <span style={{ color: '#555', fontSize: '10px', background: '#1a1a1a', padding: '1px 6px', borderRadius: '10px' }}>
                        {d.count}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {selectedFilters.length > 0 && (
            <button
              onClick={() => setSelectedFilters([])}
              style={{ padding: '4px 6px', background: 'transparent', border: 'none', color: '#666', fontSize: '11px', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Sort dropdown */}
        <div style={{ position: 'relative' }} ref={sortDropdownRef}>
          <button
            onClick={() => setShowSortDropdown(!showSortDropdown)}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '4px 7px', background: 'transparent',
              border: '1px solid #222', borderRadius: '5px',
              color: '#888', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <ArrowUpDown size={11} />
            {SORT_LABELS[sortOrder]}
            <ChevronDown size={10} />
          </button>

          {showSortDropdown && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: '4px',
              background: '#141414', border: '1px solid #222', borderRadius: '10px',
              padding: '4px', minWidth: '160px', zIndex: 1000,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}>
              {(Object.keys(SORT_LABELS) as SortOrder[]).map(key => (
                <button
                  key={key}
                  onClick={() => { setSortOrder(key); setShowSortDropdown(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    width: '100%', padding: '7px 10px',
                    background: sortOrder === key ? 'rgba(255,255,255,0.04)' : 'transparent',
                    border: 'none', borderRadius: '5px',
                    color: sortOrder === key ? '#f0f0f0' : '#999',
                    fontSize: '12px', cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = sortOrder === key ? 'rgba(255,255,255,0.04)' : 'transparent'; }}
                >
                  {sortOrder === key && <span style={{ color: '#22c55e', fontSize: '12px' }}>✓</span>}
                  {SORT_LABELS[key]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          fontSize: '11px', color: '#666', whiteSpace: 'nowrap',
        }}>
          <span>{total > 0 ? `${startItem}-${endItem} of ${total}` : '0 nodes'}</span>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            style={{
              background: 'transparent', border: '1px solid #222', borderRadius: '4px',
              color: page <= 1 ? '#333' : '#888', cursor: page <= 1 ? 'default' : 'pointer',
              padding: '2px 4px', display: 'flex',
            }}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{
              background: 'transparent', border: '1px solid #222', borderRadius: '4px',
              color: page >= totalPages ? '#333' : '#888',
              cursor: page >= totalPages ? 'default' : 'pointer',
              padding: '2px 4px', display: 'flex',
            }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: '40px', color: '#666', textAlign: 'center', fontSize: '13px' }}>Loading...</div>
        ) : nodes.length === 0 ? (
          <div style={{ padding: '40px', color: '#666', textAlign: 'center', fontSize: '13px' }}>
            {activeSearch || selectedFilters.length > 0 ? 'No nodes match your filters.' : 'No nodes yet.'}
          </div>
        ) : (
          <table style={{ minWidth: '1600px', width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <th style={thStyle({ width: '240px' })}>TITLE</th>
                <th style={thStyle({ width: '55px', textAlign: 'right' })}>ID</th>
                <th style={thStyle({ width: '200px' })}>DESCRIPTION</th>
                <th style={thStyle({ width: '160px' })}>NOTES</th>
                <th style={thStyle({ width: '180px' })}>LINK</th>
                <th style={thStyle({ width: '160px' })}>DIMENSIONS</th>
                <th style={thStyle({ width: '50px', textAlign: 'right' })}>EDGES</th>
                <th style={thStyle({ width: '90px' })}>EVENT</th>
                <th style={thStyle({ width: '85px' })}>UPDATED</th>
                <th style={thStyle({ width: '85px' })}>CREATED</th>
                <th style={thStyle({ width: '160px' })}>METADATA</th>
                <th style={thStyle({ width: '160px' })}>CHUNK</th>
                <th style={thStyle({ width: '80px' })}>CHUNK STATUS</th>
                <th style={thStyle({ width: '85px' })}>EMB UPDATED</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node, i) => {
                const metaStr = node.metadata
                  ? (typeof node.metadata === 'string' ? node.metadata : JSON.stringify(node.metadata))
                  : '';
                return (
                  <tr
                    key={node.id}
                    onClick={() => onNodeClick(node.id)}
                    onMouseEnter={() => setHoveredRow(node.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      height: '44px',
                      cursor: 'pointer',
                      background: hoveredRow === node.id
                        ? '#141414'
                        : i % 2 === 0 ? '#080808' : '#0d0d0d',
                      transition: 'background 0.1s ease',
                    }}
                  >
                    {/* Title */}
                    <td style={tdStyle()}>
                      <div style={truncCell}>
                        <span style={{ fontSize: '13px', color: '#e0e0e0', fontWeight: 400 }}>
                          {node.title || 'Untitled'}
                        </span>
                      </div>
                    </td>

                    {/* ID */}
                    <td style={tdStyle({ textAlign: 'right' })}>
                      <span style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                        fontSize: '11px', color: '#555',
                      }}>
                        {node.id}
                      </span>
                    </td>

                    {/* Description */}
                    <td style={tdStyle()}>
                      <div style={truncCell}>
                        <span style={{ fontSize: '11px', color: '#888' }}>
                          {node.description || '\u2014'}
                        </span>
                      </div>
                    </td>

                    {/* Notes */}
                    <td style={tdStyle()}>
                      <div style={truncCell}>
                        <span style={{ fontSize: '11px', color: '#888' }}>
                          {node.notes ? node.notes.slice(0, 120) : '\u2014'}
                        </span>
                      </div>
                    </td>

                    {/* Link */}
                    <td style={tdStyle()}>
                      <div style={truncCell}>
                        {node.link ? (
                          <span style={{ fontSize: '11px', color: '#6a9fd8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <ExternalLink size={10} style={{ flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {node.link.replace(/^https?:\/\/(www\.)?/, '')}
                            </span>
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#333' }}>{'\u2014'}</span>
                        )}
                      </div>
                    </td>

                    {/* Dimensions */}
                    <td style={tdStyle()}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', overflow: 'hidden', maxHeight: '36px' }}>
                        {node.dimensions && node.dimensions.length > 0 ? (
                          <>
                            {node.dimensions.slice(0, 3).map(d => (
                              <span key={d} style={{
                                fontSize: '9px', padding: '1px 5px',
                                background: '#111914', border: '1px solid #1f2f24',
                                color: '#bbf7d0', borderRadius: '3px',
                                whiteSpace: 'nowrap',
                              }}>
                                {d}
                              </span>
                            ))}
                            {node.dimensions.length > 3 && (
                              <span style={{ fontSize: '9px', color: '#555' }}>
                                +{node.dimensions.length - 3}
                              </span>
                            )}
                          </>
                        ) : (
                          <span style={{ fontSize: '10px', color: '#333' }}>{'\u2014'}</span>
                        )}
                      </div>
                    </td>

                    {/* Edges */}
                    <td style={tdStyle({ textAlign: 'right' })}>
                      <span style={{ fontSize: '12px', color: node.edge_count ? '#888' : '#333' }}>
                        {node.edge_count ?? 0}
                      </span>
                    </td>

                    {/* Event Date */}
                    <td style={tdStyle()}>
                      <span style={{ fontSize: '11px', color: node.event_date ? '#888' : '#333' }}>
                        {formatDate(node.event_date)}
                      </span>
                    </td>

                    {/* Updated */}
                    <td style={tdStyle()}>
                      <span style={{ fontSize: '11px', color: '#666' }}>
                        {formatRelativeTime(node.updated_at)}
                      </span>
                    </td>

                    {/* Created */}
                    <td style={tdStyle()}>
                      <span style={{ fontSize: '11px', color: '#666' }}>
                        {formatRelativeTime(node.created_at)}
                      </span>
                    </td>

                    {/* Metadata */}
                    <td style={tdStyle()}>
                      <div style={truncCell}>
                        <span style={{ fontSize: '10px', color: '#555', fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace' }}>
                          {metaStr || '\u2014'}
                        </span>
                      </div>
                    </td>

                    {/* Chunk */}
                    <td style={tdStyle()}>
                      <div style={truncCell}>
                        <span style={{ fontSize: '10px', color: '#555' }}>
                          {node.chunk ? node.chunk.slice(0, 100) : '\u2014'}
                        </span>
                      </div>
                    </td>

                    {/* Chunk Status */}
                    <td style={tdStyle()}>
                      <span style={{
                        fontSize: '10px',
                        color: node.chunk_status === 'chunked' ? '#4a9' : node.chunk_status === 'error' ? '#e55' : '#555',
                      }}>
                        {node.chunk_status || '\u2014'}
                      </span>
                    </td>

                    {/* Embedding Updated */}
                    <td style={tdStyle()}>
                      <span style={{ fontSize: '11px', color: '#666' }}>
                        {node.embedding_updated_at ? formatRelativeTime(node.embedding_updated_at) : '\u2014'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function thStyle(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    position: 'sticky' as const,
    top: 0,
    background: '#0a0a0a',
    padding: '8px 12px',
    fontSize: '10px',
    fontWeight: 500,
    color: '#555',
    textAlign: 'left',
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    zIndex: 1,
    ...extra,
  };
}

function tdStyle(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    padding: '0 12px',
    verticalAlign: 'middle',
    borderBottom: '1px solid #111',
    overflow: 'hidden',
    ...extra,
  };
}

const truncCell: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
