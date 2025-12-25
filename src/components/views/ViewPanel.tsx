"use client";

import { useState, useEffect, useCallback } from 'react';
import { Eye, List, Columns, LayoutGrid } from 'lucide-react';
import { ViewType, ViewConfig, ViewFilter, DEFAULT_VIEW_CONFIG, KanbanColumn } from '@/types/views';
import { Node } from '@/types/database';
import ListView from './ListView';
import KanbanView from './KanbanView';
import GridView from './GridView';
import ViewFilters from './ViewFilters';

interface ViewPanelProps {
  viewMode: ViewType;
  onViewModeChange: (mode: ViewType) => void;
  onNodeClick: (nodeId: number) => void;
  refreshTrigger?: number;
}

export default function ViewPanel({
  viewMode,
  onViewModeChange,
  onNodeClick,
  refreshTrigger
}: ViewPanelProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ViewConfig>(DEFAULT_VIEW_CONFIG);
  const [dimensions, setDimensions] = useState<string[]>([]);

  // Fetch all nodes
  const fetchNodes = useCallback(async () => {
    setLoading(true);
    try {
      // Build query params from filters
      const params = new URLSearchParams();
      params.set('limit', '500');

      if (config.filters.length > 0) {
        const includeDimensions = config.filters
          .filter(f => f.operator === 'includes')
          .map(f => f.dimension);
        if (includeDimensions.length > 0) {
          params.set('dimensions', includeDimensions.join(','));
        }
      }

      if (config.sort) {
        params.set('sortBy', config.sort.field);
        params.set('sortOrder', config.sort.direction);
      }

      const response = await fetch(`/api/nodes?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        let filteredNodes = data.nodes || [];

        // Apply exclude filters client-side
        const excludeDimensions = config.filters
          .filter(f => f.operator === 'excludes')
          .map(f => f.dimension);
        if (excludeDimensions.length > 0) {
          filteredNodes = filteredNodes.filter((node: Node) =>
            !excludeDimensions.some(dim => node.dimensions?.includes(dim))
          );
        }

        setNodes(filteredNodes);
      }
    } catch (error) {
      console.error('Failed to fetch nodes:', error);
    } finally {
      setLoading(false);
    }
  }, [config.filters, config.sort]);

  // Fetch available dimensions
  const fetchDimensions = useCallback(async () => {
    try {
      const response = await fetch('/api/dimensions/popular');
      if (response.ok) {
        const data = await response.json();
        const dims = data.data?.map((d: { dimension: string }) => d.dimension) || [];
        setDimensions(dims);
      }
    } catch (error) {
      console.error('Failed to fetch dimensions:', error);
    }
  }, []);

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes, refreshTrigger]);

  useEffect(() => {
    fetchDimensions();
  }, [fetchDimensions]);

  const handleFilterChange = (filters: ViewFilter[]) => {
    setConfig(prev => ({ ...prev, filters }));
  };

  const handleFilterLogicChange = (logic: 'and' | 'or') => {
    setConfig(prev => ({ ...prev, filterLogic: logic }));
  };

  const handleColumnChange = (columns: KanbanColumn[]) => {
    setConfig(prev => ({ ...prev, columns }));
  };

  const handleNodeDimensionUpdate = async (nodeId: number, newDimension: string, oldDimension?: string) => {
    // Update node's dimensions (add new, remove old if kanban move)
    try {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return;

      let newDimensions = [...(node.dimensions || [])];

      // Remove old dimension if moving in kanban
      if (oldDimension) {
        newDimensions = newDimensions.filter(d => d !== oldDimension);
      }

      // Add new dimension if not already present
      if (!newDimensions.includes(newDimension)) {
        newDimensions.push(newDimension);
      }

      const response = await fetch(`/api/nodes/${nodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensions: newDimensions })
      });

      if (response.ok) {
        // Refresh nodes to get updated data
        fetchNodes();
      }
    } catch (error) {
      console.error('Failed to update node dimensions:', error);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#000' }}>
      {/* Header with View Mode Selector */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid #333',
        background: '#0a0a0a',
        flexShrink: 0
      }}>
        <div style={{ fontSize: '12px', color: '#888', fontWeight: 500 }}>
          {nodes.length} nodes
        </div>

        {/* View Mode Buttons */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px'
        }}>
          <button
            onClick={() => onViewModeChange('focus')}
            style={{
              padding: '6px 8px',
              background: viewMode === 'focus' ? '#1a1a1a' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: viewMode === 'focus' ? '#22c55e' : '#666',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.2s'
            }}
            title="Focus View"
          >
            <Eye size={14} />
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            style={{
              padding: '6px 8px',
              background: viewMode === 'list' ? '#1a1a1a' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: viewMode === 'list' ? '#22c55e' : '#666',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.2s'
            }}
            title="List View"
          >
            <List size={14} />
          </button>
          <button
            onClick={() => onViewModeChange('kanban')}
            style={{
              padding: '6px 8px',
              background: viewMode === 'kanban' ? '#1a1a1a' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: viewMode === 'kanban' ? '#22c55e' : '#666',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.2s'
            }}
            title="Kanban View"
          >
            <Columns size={14} />
          </button>
          <button
            onClick={() => onViewModeChange('grid')}
            style={{
              padding: '6px 8px',
              background: viewMode === 'grid' ? '#1a1a1a' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              color: viewMode === 'grid' ? '#22c55e' : '#666',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.2s'
            }}
            title="Grid View"
          >
            <LayoutGrid size={14} />
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <ViewFilters
        filters={config.filters}
        filterLogic={config.filterLogic}
        dimensions={dimensions}
        onFilterChange={handleFilterChange}
        onFilterLogicChange={handleFilterLogicChange}
      />

      {/* Content Area */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {loading ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#666'
          }}>
            Loading...
          </div>
        ) : (
          <>
            {viewMode === 'list' && (
              <ListView
                nodes={nodes}
                onNodeClick={onNodeClick}
              />
            )}
            {viewMode === 'kanban' && (
              <KanbanView
                nodes={nodes}
                columns={config.columns || []}
                dimensions={dimensions}
                onNodeClick={onNodeClick}
                onColumnChange={handleColumnChange}
                onNodeDimensionUpdate={handleNodeDimensionUpdate}
              />
            )}
            {viewMode === 'grid' && (
              <GridView
                nodes={nodes}
                onNodeClick={onNodeClick}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
