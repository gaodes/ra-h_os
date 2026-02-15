"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Filter, ChevronDown, X, ArrowUpDown, GripVertical } from 'lucide-react';
import type { Node } from '@/types/database';
import { getNodeIcon } from '@/utils/nodeIcons';
import { useDimensionIcons } from '@/context/DimensionIconsContext';
import { usePersistentState } from '@/hooks/usePersistentState';
import type { PendingNode } from '../layout/ThreePanelLayout';

type SortOrder = 'updated' | 'edges' | 'created' | 'custom';

const SORT_LABELS: Record<SortOrder, string> = {
  updated: 'Updated',
  edges: 'Edges',
  created: 'Created',
  custom: 'Custom',
};

interface ColumnFilter {
  id: string;
  dimension: string;
}

interface DimensionSummary {
  dimension: string;
  count: number;
  isPriority: boolean;
  description?: string | null;
}

const INPUT_TYPE_LABELS: Record<string, string> = {
  youtube: 'Extracting YouTube video...',
  website: 'Extracting webpage...',
  pdf: 'Extracting PDF...',
  note: 'Creating note...',
  chat: 'Importing transcript...',
};

function PendingNodeCard({ pending, onDismiss }: { pending: PendingNode; onDismiss?: () => void }) {
  const isError = pending.status === 'error';
  return (
    <div style={{
      padding: '10px 12px',
      background: 'transparent',
      borderBottom: '1px solid #141414',
      borderLeft: `3px solid ${isError ? '#ef4444' : '#22c55e'}`,
      opacity: 0.8,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          background: '#141414',
          border: `1px solid ${isError ? 'rgba(239,68,68,0.3)' : '#1f1f1f'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {isError ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <span className="pending-spinner" />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 500,
            color: isError ? '#ef4444' : '#888',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {isError ? 'Failed' : (INPUT_TYPE_LABELS[pending.inputType] || 'Processing...')}
          </div>
          <div style={{
            fontSize: '11px',
            color: '#555',
            marginTop: '2px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {isError && pending.error ? pending.error : pending.input}
          </div>
        </div>
        {isError && onDismiss && (
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            style={{
              padding: '4px',
              background: 'transparent',
              border: 'none',
              color: '#555',
              cursor: 'pointer',
              borderRadius: '4px',
              display: 'flex',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; }}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <style jsx>{`
        .pending-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid #22c55e;
          border-top-color: transparent;
          border-radius: 50%;
          animation: pendingSpin 0.8s linear infinite;
        }
        @keyframes pendingSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

interface ViewsOverlayProps {
  onNodeClick: (nodeId: number) => void;
  onNodeOpenInOtherPane?: (nodeId: number) => void;
  refreshToken?: number;
  pendingNodes?: PendingNode[];
  onDismissPending?: (id: string) => void;
}

export default function ViewsOverlay({ onNodeClick, onNodeOpenInOtherPane, refreshToken = 0, pendingNodes, onDismissPending }: ViewsOverlayProps) {
  const { dimensionIcons } = useDimensionIcons();

  // Dimensions for filter picker
  const [dimensions, setDimensions] = useState<DimensionSummary[]>([]);
  const [dimensionsLoading, setDimensionsLoading] = useState(true);

  // Sort order (persisted)
  const [sortOrder, setSortOrder] = usePersistentState<SortOrder>('ui.feedSortOrder', 'updated');

  // Custom order (persisted) — stores node IDs in user-defined order
  const [customOrder, setCustomOrder] = usePersistentState<number[]>('ui.feedCustomOrder', []);

  // Drag-to-reorder state
  const [reorderDragIndex, setReorderDragIndex] = useState<number | null>(null);
  const [reorderDropIndex, setReorderDropIndex] = useState<number | null>(null);

  // Filter system state
  const [columns, setColumns] = useState<ColumnFilter[]>([]);
  const [filteredNodes, setFilteredNodes] = useState<Node[]>([]);
  const [filteredNodesLoading, setFilteredNodesLoading] = useState(false);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [filterSearchQuery, setFilterSearchQuery] = useState('');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // Derive selectedFilters for backward compatibility (unique dimensions)
  const selectedFilters = useMemo(() =>
    [...new Set(columns.map(c => c.dimension))],
    [columns]
  );

  // Sorted dimensions (locked first)
  const sortedDimensions = useMemo(() => {
    return [...dimensions].sort((a, b) => {
      if (a.isPriority && !b.isPriority) return -1;
      if (!a.isPriority && b.isPriority) return 1;
      return a.dimension.localeCompare(b.dimension);
    });
  }, [dimensions]);

  // Fetch functions
  const fetchDimensions = useCallback(async () => {
    setDimensionsLoading(true);
    try {
      const response = await fetch('/api/dimensions');
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch dimensions');
      }
      setDimensions(data.data || []);
    } catch (error) {
      console.error('Error fetching dimensions:', error);
    } finally {
      setDimensionsLoading(false);
    }
  }, []);

  const fetchAllNodes = useCallback(async () => {
    setFilteredNodesLoading(true);
    try {
      // Custom sort fetches with 'updated' then reorders client-side
      const apiSort = sortOrder === 'custom' ? 'updated' : sortOrder;
      const response = await fetch(`/api/nodes?limit=500&sortBy=${apiSort}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch nodes');
      }
      const nodes: Node[] = data.data || [];
      if (sortOrder === 'custom' && customOrder.length > 0) {
        // Reorder nodes based on saved custom order
        const orderMap = new Map(customOrder.map((id, idx) => [id, idx]));
        const ordered: Node[] = [];
        const unordered: Node[] = [];
        for (const node of nodes) {
          if (orderMap.has(node.id)) {
            ordered.push(node);
          } else {
            unordered.push(node); // New nodes not in custom order — append at bottom
          }
        }
        ordered.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
        setFilteredNodes([...ordered, ...unordered]);
      } else {
        setFilteredNodes(nodes);
      }
    } catch (error) {
      console.error('Error fetching nodes:', error);
    } finally {
      setFilteredNodesLoading(false);
    }
  }, [sortOrder, customOrder]);

  const fetchFilteredNodes = useCallback(async (filters: string[]) => {
    if (filters.length === 0) {
      fetchAllNodes();
      return;
    }
    setFilteredNodesLoading(true);
    try {
      const apiSort = sortOrder === 'custom' ? 'updated' : sortOrder;
      const response = await fetch(`/api/nodes?limit=500&sortBy=${apiSort}&dimensions=${encodeURIComponent(filters.join(','))}&dimensionsMatch=all`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch nodes');
      }
      const nodes: Node[] = data.data || [];
      if (sortOrder === 'custom' && customOrder.length > 0) {
        const orderMap = new Map(customOrder.map((id, idx) => [id, idx]));
        const ordered: Node[] = [];
        const unordered: Node[] = [];
        for (const node of nodes) {
          if (orderMap.has(node.id)) {
            ordered.push(node);
          } else {
            unordered.push(node);
          }
        }
        ordered.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
        setFilteredNodes([...ordered, ...unordered]);
      } else {
        setFilteredNodes(nodes);
      }
    } catch (error) {
      console.error('Error fetching filtered nodes:', error);
    } finally {
      setFilteredNodesLoading(false);
    }
  }, [fetchAllNodes, sortOrder, customOrder]);

  // Stringify filters for stable dependency
  const filtersKey = selectedFilters.join(',');

  // Fetch dimensions on mount
  useEffect(() => {
    fetchDimensions();
  }, [fetchDimensions]);

  // Fetch nodes on mount and when filters/sort/refreshToken change
  useEffect(() => {
    if (refreshToken > 0) {
      console.log('🔄 Feed refreshing due to SSE event (refreshToken:', refreshToken, ')');
    }
    if (selectedFilters.length > 0) {
      fetchFilteredNodes(selectedFilters);
    } else {
      fetchAllNodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, sortOrder, refreshToken]);

  // Also refresh dimensions when data changes (for filter picker counts)
  useEffect(() => {
    if (refreshToken > 0) {
      fetchDimensions();
    }
  }, [refreshToken, fetchDimensions]);

  // Column management
  const addColumn = (dimension: string) => {
    const newColumn: ColumnFilter = {
      id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      dimension
    };
    setColumns([...columns, newColumn]);
    setShowFilterPicker(false);
    setFilterSearchQuery('');
  };

  const removeFilter = (dimension: string) => {
    const idx = columns.findIndex(c => c.dimension === dimension);
    if (idx !== -1) {
      setColumns(columns.filter((_, i) => i !== idx));
    }
  };

  const clearFilters = () => {
    setColumns([]);
  };

  // Filter dimensions for picker
  const filterPickerDimensions = sortedDimensions.filter(d =>
    d.dimension.toLowerCase().includes(filterSearchQuery.toLowerCase())
  );

  // Close dropdowns on outside click
  const filterPickerRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

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

  // Reorder handlers
  const handleReorderDrop = useCallback((dropIdx: number) => {
    if (reorderDragIndex === null || reorderDragIndex === dropIdx) {
      setReorderDragIndex(null);
      setReorderDropIndex(null);
      return;
    }
    // Reorder filteredNodes and persist
    const newNodes = [...filteredNodes];
    const [moved] = newNodes.splice(reorderDragIndex, 1);
    newNodes.splice(dropIdx > reorderDragIndex ? dropIdx - 1 : dropIdx, 0, moved);
    setFilteredNodes(newNodes);
    setCustomOrder(newNodes.map(n => n.id));
    setReorderDragIndex(null);
    setReorderDropIndex(null);
  }, [reorderDragIndex, filteredNodes, setCustomOrder]);

  // Render node card
  const renderNodeCard = (node: Node, index: number) => {
    const nodeIcon = getNodeIcon(node, dimensionIcons, 18);
    const isCustomSort = sortOrder === 'custom';
    const isDragSource = reorderDragIndex === index;
    const isDropTarget = reorderDropIndex === index;

    // Description preview — first meaningful line, truncated
    const descPreview = node.description && node.description.length > 10
      ? node.description.slice(0, 120) + (node.description.length > 120 ? '...' : '')
      : null;

    return (
      <div
        key={node.id}
        onClick={() => onNodeClick(node.id)}
        draggable
        onDragStart={(e) => {
          const title = node.title || 'Untitled';
          e.dataTransfer.setData('application/x-rah-node', JSON.stringify({ id: node.id, title }));
          e.dataTransfer.setData('application/node-info', JSON.stringify({ id: node.id, title, dimensions: node.dimensions || [] }));
          e.dataTransfer.setData('text/plain', `[NODE:${node.id}:"${title}"]`);
        }}
        onDragOver={(e) => {
          if (!isCustomSort || reorderDragIndex === null) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setReorderDropIndex(index);
        }}
        onDragLeave={() => {
          if (!isCustomSort) return;
          setReorderDropIndex(null);
        }}
        onDrop={(e) => {
          if (!isCustomSort || reorderDragIndex === null) return;
          e.preventDefault();
          handleReorderDrop(index);
        }}
        style={{
          padding: '10px 12px',
          background: 'transparent',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          borderBottom: '1px solid #141414',
          borderLeft: '3px solid transparent',
          opacity: isDragSource ? 0.4 : 1,
          borderTop: isDropTarget ? '2px solid #22c55e' : '2px solid transparent',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (onNodeOpenInOtherPane) {
            onNodeOpenInOtherPane(node.id);
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          {/* Grip handle — only in custom sort mode */}
          {isCustomSort && (
            <div
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                setReorderDragIndex(index);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('application/x-rah-reorder', String(index));
              }}
              onDragEnd={() => {
                setReorderDragIndex(null);
                setReorderDropIndex(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '16px',
                cursor: 'grab',
                color: '#444',
                flexShrink: 0,
                alignSelf: 'center',
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#888'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#444'; }}
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical size={14} />
            </div>
          )}
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: '#141414',
            border: '1px solid #1f1f1f',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {nodeIcon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: descPreview ? '2px' : '4px'
            }}>
              <span style={{
                fontSize: '13px',
                fontWeight: 500,
                color: '#f0f0f0',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flex: 1,
                minWidth: 0,
              }}>
                {node.title || 'Untitled'}
              </span>
              {node.edge_count != null && node.edge_count > 0 && (
                <span style={{
                  fontSize: '10px',
                  color: '#555',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: '9px' }}>🔗</span>
                  {node.edge_count}
                </span>
              )}
              <span style={{
                fontSize: '10px',
                color: '#444',
                background: '#141414',
                padding: '2px 6px',
                borderRadius: '4px',
                fontFamily: 'monospace',
                flexShrink: 0,
              }}>
                #{node.id}
              </span>
            </div>
            {descPreview && (
              <div style={{
                fontSize: '11px',
                color: '#666',
                lineHeight: '1.4',
                marginBottom: '4px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {descPreview}
              </div>
            )}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '3px',
            }}>
              {node.dimensions && node.dimensions.length > 0 ? (
                <>
                  {node.dimensions.slice(0, 3).map(d => (
                    <span
                      key={d}
                      style={{
                        fontSize: '9px',
                        padding: '1px 5px',
                        background: 'rgba(34, 197, 94, 0.08)',
                        color: '#4a9',
                        borderRadius: '3px'
                      }}
                    >
                      {d}
                    </span>
                  ))}
                  {node.dimensions.length > 3 && (
                    <span style={{ fontSize: '9px', color: '#555' }}>
                      +{node.dimensions.length - 3}
                    </span>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'transparent'
    }}>
      {/* Header with filters + sort */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid #1a1a1a',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap'
      }}>
        {/* Filter chips + add filter button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
          {selectedFilters.map(filter => (
            <div
              key={filter}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 8px',
                background: 'rgba(34, 197, 94, 0.06)',
                border: '1px solid rgba(34, 197, 94, 0.12)',
                borderRadius: '5px',
                fontSize: '11px',
                color: '#5a9'
              }}
            >
              {filter}
              <button
                onClick={() => removeFilter(filter)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#5a9',
                  cursor: 'pointer',
                  padding: '0',
                  display: 'flex',
                  alignItems: 'center'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#5a9'; }}
              >
                <X size={11} />
              </button>
            </div>
          ))}

          {/* Add filter button */}
          <div style={{ position: 'relative' }} ref={filterPickerRef}>
            <button
              onClick={() => setShowFilterPicker(!showFilterPicker)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                background: 'transparent',
                border: '1px solid #222',
                borderRadius: '5px',
                color: '#888',
                fontSize: '11px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.borderColor = '#333';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = '#222';
              }}
            >
              <Filter size={11} />
              Filter
            </button>

            {/* Filter picker dropdown */}
            {showFilterPicker && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: '4px',
                background: '#141414',
                border: '1px solid #222',
                borderRadius: '10px',
                padding: '6px',
                minWidth: '220px',
                maxHeight: '320px',
                overflowY: 'auto',
                zIndex: 1000,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
              }}>
                <input
                  type="text"
                  value={filterSearchQuery}
                  onChange={(e) => setFilterSearchQuery(e.target.value)}
                  placeholder="Search dimensions..."
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    background: '#0d0d0d',
                    border: '1px solid transparent',
                    borderRadius: '6px',
                    color: '#f0f0f0',
                    fontSize: '12px',
                    marginBottom: '4px',
                    outline: 'none',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#333'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; }}
                />
                {dimensionsLoading ? (
                  <div style={{ padding: '12px', color: '#666', fontSize: '12px', textAlign: 'center' }}>
                    Loading dimensions...
                  </div>
                ) : filterPickerDimensions.length === 0 ? (
                  <div style={{ padding: '12px', color: '#666', fontSize: '12px', textAlign: 'center' }}>
                    {filterSearchQuery ? 'No matching dimensions' : 'No dimensions available'}
                  </div>
                ) : (
                  filterPickerDimensions.map(d => (
                    <button
                      key={d.dimension}
                      onClick={() => addColumn(d.dimension)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '7px 10px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '5px',
                        color: '#ccc',
                        fontSize: '12px',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span>{d.dimension}</span>
                      <span style={{
                        color: '#555',
                        fontSize: '10px',
                        background: '#1a1a1a',
                        padding: '1px 6px',
                        borderRadius: '10px',
                      }}>
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
              onClick={clearFilters}
              style={{
                padding: '4px 8px',
                background: 'transparent',
                border: 'none',
                color: '#666',
                fontSize: '11px',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; }}
            >
              Clear all
            </button>
          )}
        </div>

        {/* Sort dropdown */}
        <div style={{ position: 'relative' }} ref={sortDropdownRef}>
          <button
            onClick={() => setShowSortDropdown(!showSortDropdown)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 8px',
              background: 'transparent',
              border: '1px solid #222',
              borderRadius: '5px',
              color: '#888',
              fontSize: '11px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
              e.currentTarget.style.borderColor = '#333';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = '#222';
            }}
          >
            <ArrowUpDown size={11} />
            {SORT_LABELS[sortOrder]}
            <ChevronDown size={10} />
          </button>

          {showSortDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '4px',
              background: '#141414',
              border: '1px solid #222',
              borderRadius: '10px',
              padding: '4px',
              minWidth: '140px',
              zIndex: 1000,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
            }}>
              {(Object.keys(SORT_LABELS) as SortOrder[]).map(key => (
                <button
                  key={key}
                  onClick={() => {
                    setSortOrder(key);
                    setShowSortDropdown(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '7px 10px',
                    background: sortOrder === key ? 'rgba(255,255,255,0.04)' : 'transparent',
                    border: 'none',
                    borderRadius: '5px',
                    color: sortOrder === key ? '#f0f0f0' : '#999',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
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
      </div>

      {/* Content area — list view */}
      {filteredNodesLoading ? (
        <div style={{ padding: '40px', color: '#888', textAlign: 'center' }}>
          Loading...
        </div>
      ) : filteredNodes.length === 0 ? (
        <div style={{ padding: '40px', color: '#888', textAlign: 'center' }}>
          {selectedFilters.length > 0 ? 'No nodes match the selected filters.' : 'No nodes yet. Add some content to get started.'}
        </div>
      ) : (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {pendingNodes && pendingNodes.length > 0 && pendingNodes.map(p => (
            <PendingNodeCard
              key={p.id}
              pending={p}
              onDismiss={onDismissPending ? () => onDismissPending(p.id) : undefined}
            />
          ))}
          {filteredNodes.map((node, index) => renderNodeCard(node, index))}
        </div>
      )}
    </div>
  );
}
