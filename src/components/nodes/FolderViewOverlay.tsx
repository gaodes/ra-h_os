"use client";

import { useEffect, useMemo, useState, useRef, type DragEvent } from 'react';
import { Folder, Check, X, ArrowLeft, Plus, Trash2, Edit2, LayoutGrid, List, Columns3, Save, Filter, ChevronDown } from 'lucide-react';
import type { Node } from '@/types/database';
import ConfirmDialog from '../common/ConfirmDialog';
import InputDialog from '../common/InputDialog';
import { getNodeIcon } from '@/utils/nodeIcons';
import { usePersistentState } from '@/hooks/usePersistentState';

type DimensionViewMode = 'grid' | 'list' | 'kanban';
type OverlayMode = 'folders' | 'filtered';

interface SavedView {
  id: string;
  name: string;
  filters: string[];
  viewMode: DimensionViewMode;
  kanbanColumns?: { dimension: string; order: number }[];
  createdAt: string;
}

interface DimensionSummary {
  dimension: string;
  count: number;
  isPriority: boolean;
  description?: string | null;
}

interface FolderViewOverlayProps {
  onClose: () => void;
  onNodeOpen: (nodeId: number) => void;
  refreshToken: number;
  onDataChanged?: () => void;
}

const PAGE_SIZE = 100;

export default function FolderViewOverlay({ onClose, onNodeOpen, refreshToken, onDataChanged }: FolderViewOverlayProps) {
  const [view, setView] = useState<'dimensions' | 'nodes'>('dimensions');
  const [dimensions, setDimensions] = useState<DimensionSummary[]>([]);
  const [dimensionsLoading, setDimensionsLoading] = useState(true);
  const [dimensionsError, setDimensionsError] = useState<string | null>(null);
  const [selectedDimension, setSelectedDimension] = useState<DimensionSummary | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [nodesError, setNodesError] = useState<string | null>(null);
  const [hasMoreNodes, setHasMoreNodes] = useState(false);
  const [nodeOffset, setNodeOffset] = useState(0);
  const [deletingDimension, setDeletingDimension] = useState<string | null>(null);
  const [dimensionPendingDelete, setDimensionPendingDelete] = useState<string | null>(null);
  const [dragHoverDimension, setDragHoverDimension] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState<boolean>(false);
  const [editDescriptionText, setEditDescriptionText] = useState('');
  const [editingDimensionName, setEditingDimensionName] = useState<boolean>(false);
  const [editDimensionNameText, setEditDimensionNameText] = useState('');
  const [showAddDimensionDialog, setShowAddDimensionDialog] = useState(false);
  const draggedNodeRef = useRef<{ id: number; dimensions?: string[] } | null>(null);

  // View mode state (persisted)
  const [viewMode, setViewMode] = usePersistentState<DimensionViewMode>('ui.dimensionViewMode', 'grid');

  // All nodes state (for list/kanban view at top level)
  const [allNodes, setAllNodes] = useState<Node[]>([]);
  const [allNodesLoading, setAllNodesLoading] = useState(false);

  // Kanban columns state (global, persisted)
  const [kanbanColumns, setKanbanColumns] = usePersistentState<{ dimension: string; order: number }[]>(
    'ui.kanbanColumns.global',
    []
  );

  // Kanban-specific drag states
  const [draggedNodeId, setDraggedNodeId] = useState<number | null>(null);
  const [draggedFromColumn, setDraggedFromColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [showKanbanColumnPicker, setShowKanbanColumnPicker] = useState(false);
  const [kanbanSearchQuery, setKanbanSearchQuery] = useState('');

  // Filter/View system state
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('folders');
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [filteredNodes, setFilteredNodes] = useState<Node[]>([]);
  const [filteredNodesLoading, setFilteredNodesLoading] = useState(false);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [filterSearchQuery, setFilterSearchQuery] = useState('');
  const [savedViews, setSavedViews] = usePersistentState<SavedView[]>('ui.savedViews', []);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  const [showSavedViewsDropdown, setShowSavedViewsDropdown] = useState(false);

  // Kanban drag-and-drop state
  const [draggedNode, setDraggedNode] = useState<{ id: number; fromDimension: string } | null>(null);
  const [dropTargetDimension, setDropTargetDimension] = useState<string | null>(null);

  // Kanban column reordering state
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [columnDropTarget, setColumnDropTarget] = useState<string | null>(null);

  // Node priority ordering within dimensions (persisted)
  const [dimensionOrders, setDimensionOrders] = usePersistentState<Record<string, number[]>>('ui.dimensionOrders', {});

  // Within-dimension reorder drag state
  const [reorderDrag, setReorderDrag] = useState<{ nodeId: number; dimension: string; index: number } | null>(null);
  const [reorderDropIndex, setReorderDropIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchDimensions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (view === 'dimensions') {
      fetchDimensions();
    } else if (selectedDimension) {
      fetchNodes(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  useEffect(() => {
    if (!selectedDimension) return;
    fetchNodes(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDimension?.dimension]);

  // Fetch all nodes when viewMode is list or kanban (at top level)
  useEffect(() => {
    if (view === 'dimensions' && (viewMode === 'list' || viewMode === 'kanban')) {
      fetchAllNodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, view, refreshToken]);

  const fetchAllNodes = async () => {
    setAllNodesLoading(true);
    try {
      const response = await fetch('/api/nodes?limit=500');
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch nodes');
      }
      setAllNodes(data.data || []);
    } catch (error) {
      console.error('Error fetching all nodes:', error);
    } finally {
      setAllNodesLoading(false);
    }
  };

  // Fetch filtered nodes when filters change
  useEffect(() => {
    if (overlayMode === 'filtered' && selectedFilters.length > 0) {
      fetchFilteredNodes();
    } else if (overlayMode === 'filtered' && selectedFilters.length === 0) {
      setFilteredNodes([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFilters, overlayMode, refreshToken]);

  const fetchFilteredNodes = async () => {
    if (selectedFilters.length === 0) {
      setFilteredNodes([]);
      return;
    }
    setFilteredNodesLoading(true);
    try {
      // Fetch nodes that match ANY of the selected dimensions
      const response = await fetch(`/api/nodes?limit=500`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch nodes');
      }
      // Filter client-side to get nodes matching selected dimensions
      const allFetched: Node[] = data.data || [];
      const filtered = allFetched.filter(node =>
        node.dimensions?.some(d => selectedFilters.includes(d))
      );
      setFilteredNodes(filtered);
    } catch (error) {
      console.error('Error fetching filtered nodes:', error);
    } finally {
      setFilteredNodesLoading(false);
    }
  };

  // Filter helper functions
  const addFilter = (dimension: string) => {
    if (!selectedFilters.includes(dimension)) {
      setSelectedFilters([...selectedFilters, dimension]);
    }
    setShowFilterPicker(false);
    setFilterSearchQuery('');
  };

  const removeFilter = (dimension: string) => {
    setSelectedFilters(selectedFilters.filter(f => f !== dimension));
  };

  const clearFilters = () => {
    setSelectedFilters([]);
    setActiveViewId(null);
  };

  // Kanban column reorder handler
  const handleColumnReorder = (draggedDim: string, targetDim: string) => {
    if (draggedDim === targetDim) return;

    const currentFilters = [...selectedFilters];
    const draggedIndex = currentFilters.indexOf(draggedDim);
    const targetIndex = currentFilters.indexOf(targetDim);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Remove dragged item and insert at target position
    currentFilters.splice(draggedIndex, 1);
    currentFilters.splice(targetIndex, 0, draggedDim);

    setSelectedFilters(currentFilters);
  };

  // Kanban drag-and-drop handler
  const handleKanbanDrop = async (nodeId: number, fromDimension: string, toDimension: string) => {
    if (fromDimension === toDimension) return;

    // Find the node to get its current dimensions
    const node = filteredNodes.find(n => n.id === nodeId);
    if (!node) return;

    // Calculate new dimensions: remove fromDimension, add toDimension
    const currentDimensions = node.dimensions || [];
    const newDimensions = currentDimensions
      .filter(d => d !== fromDimension)
      .concat(toDimension)
      .filter((d, i, arr) => arr.indexOf(d) === i); // Remove duplicates

    try {
      // Update the node via API
      const response = await fetch(`/api/nodes/${nodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensions: newDimensions })
      });

      if (response.ok) {
        // Refresh the filtered nodes
        fetchFilteredNodes();
        // Notify parent that data changed
        onDataChanged?.();
      }
    } catch (error) {
      console.error('Failed to update node dimensions:', error);
    }
  };

  // Saved view helper functions
  const saveCurrentView = (name: string) => {
    const newView: SavedView = {
      id: `view-${Date.now()}`,
      name: name.trim(),
      filters: [...selectedFilters],
      viewMode,
      kanbanColumns: viewMode === 'kanban' ? [...kanbanColumns] : undefined,
      createdAt: new Date().toISOString()
    };
    setSavedViews([...savedViews, newView]);
    setActiveViewId(newView.id);
    setShowSaveViewDialog(false);
  };

  const loadSavedView = (view: SavedView) => {
    setOverlayMode('filtered');
    setSelectedFilters(view.filters);
    setViewMode(view.viewMode);
    if (view.kanbanColumns) {
      setKanbanColumns(view.kanbanColumns);
    }
    setActiveViewId(view.id);
    setShowSavedViewsDropdown(false);
  };

  const deleteSavedView = (viewId: string) => {
    setSavedViews(savedViews.filter(v => v.id !== viewId));
    if (activeViewId === viewId) {
      setActiveViewId(null);
    }
  };

  const activeView = savedViews.find(v => v.id === activeViewId);

  // Sort nodes by their priority order within a dimension
  const sortNodesByDimensionOrder = (nodes: Node[], dimension: string): Node[] => {
    const order = dimensionOrders[dimension] || [];
    return [...nodes].sort((a, b) => {
      const aIndex = order.indexOf(a.id);
      const bIndex = order.indexOf(b.id);
      // Nodes in order array come first, sorted by their position
      // Nodes not in order array go to end, sorted by ID
      if (aIndex === -1 && bIndex === -1) return a.id - b.id;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  };

  // Handle reordering a node within a dimension
  const handleReorderDrop = (dimension: string, fromIndex: number, toIndex: number, nodes: Node[]) => {
    if (fromIndex === toIndex) return;

    // Get current order or create from current node order
    const currentOrder = dimensionOrders[dimension] || nodes.map(n => n.id);
    const nodeIds = [...currentOrder];

    // Ensure all nodes are in the order array
    nodes.forEach(n => {
      if (!nodeIds.includes(n.id)) {
        nodeIds.push(n.id);
      }
    });

    // Move the node from fromIndex to toIndex
    const [movedId] = nodeIds.splice(fromIndex, 1);
    nodeIds.splice(toIndex, 0, movedId);

    // Update the dimension orders
    setDimensionOrders({
      ...dimensionOrders,
      [dimension]: nodeIds
    });

    setReorderDrag(null);
    setReorderDropIndex(null);
  };

  // Get nodes grouped by dimension for list view
  const getNodesGroupedByDimension = () => {
    const groups: { dimension: string; nodes: Node[] }[] = [];
    for (const dim of selectedFilters) {
      const nodesInDim = filteredNodes.filter(n => n.dimensions?.includes(dim));
      if (nodesInDim.length > 0) {
        // Sort by dimension order
        const sortedNodes = sortNodesByDimensionOrder(nodesInDim, dim);
        groups.push({ dimension: dim, nodes: sortedNodes });
      }
    }
    return groups;
  };

  const sortedDimensions = useMemo(() => {
    return [...dimensions].sort((a, b) => {
      if (a.isPriority !== b.isPriority) {
        return a.isPriority ? -1 : 1;
      }
      return a.dimension.localeCompare(b.dimension);
    });
  }, [dimensions]);

  const fetchDimensions = async () => {
    setDimensionsLoading(true);
    setDimensionsError(null);
    try {
      const response = await fetch('/api/dimensions/popular');
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch dimensions');
      }
      setDimensions(data.data || []);
    } catch (error) {
      console.error('Error fetching dimensions:', error);
      setDimensionsError('Failed to load dimensions');
    } finally {
      setDimensionsLoading(false);
    }
  };

  const fetchNodes = async (reset = false) => {
    if (!selectedDimension) return;
    setNodesLoading(true);
    setNodesError(null);
    try {
      const offset = reset ? 0 : nodeOffset;
      const response = await fetch(`/api/nodes?dimensions=${encodeURIComponent(selectedDimension.dimension)}&limit=${PAGE_SIZE}&offset=${offset}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch nodes');
      }
      const fetchedNodes: Node[] = data.data || [];
      setNodes((prev) => reset ? fetchedNodes : [...prev, ...fetchedNodes]);
      setHasMoreNodes(fetchedNodes.length === PAGE_SIZE);
      setNodeOffset(offset + fetchedNodes.length);
    } catch (error) {
      console.error('Error fetching nodes:', error);
      setNodesError('Failed to load nodes');
    } finally {
      setNodesLoading(false);
    }
  };

  const handleSelectDimension = (dimension: DimensionSummary) => {
    setSelectedDimension(dimension);
    setNodes([]);
    setNodeOffset(0);
    setHasMoreNodes(false);
    setView('nodes');
  };

  const handleBackToDimensions = () => {
    setView('dimensions');
    setSelectedDimension(null);
    setNodes([]);
    setNodeOffset(0);
    setHasMoreNodes(false);
  };

  const handleAddDimension = async (name: string) => {
    if (!name || !name.trim()) return;
    try {
      const response = await fetch('/api/dimensions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create dimension');
      }
      await fetchDimensions();
      onDataChanged?.();
      setShowAddDimensionDialog(false);
    } catch (error) {
      console.error('Error adding dimension:', error);
      alert('Failed to create dimension. Please try again.');
    }
  };

  const handleToggleLock = async (dimension: string) => {
    try {
      const response = await fetch('/api/dimensions/popular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimension })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to toggle dimension');
      }
      await fetchDimensions();
      onDataChanged?.();
    } catch (error) {
      console.error('Error toggling lock:', error);
      alert('Failed to update lock state.');
    }
  };

  const handleDeleteDimension = async (dimension: string) => {
    setDeletingDimension(dimension);
    try {
      const response = await fetch(`/api/dimensions?name=${encodeURIComponent(dimension)}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete dimension');
      }
      if (selectedDimension?.dimension === dimension) {
        handleBackToDimensions();
      }
      await fetchDimensions();
      onDataChanged?.();
    } catch (error) {
      console.error('Error deleting dimension:', error);
      alert('Failed to delete dimension. Please try again.');
    } finally {
      setDeletingDimension((current) => (current === dimension ? null : current));
      setDimensionPendingDelete((current) => (current === dimension ? null : current));
    }
  };

  const handleNodeTileDragStart = (event: DragEvent<HTMLDivElement>, node: Node) => {
    event.dataTransfer.effectAllowed = 'copy';
    const nodeData = {
      id: node.id,
      dimensions: node.dimensions || []
    };
    // Store in ref for webview compatibility (dataTransfer.getData can fail in Electron/Tauri)
    draggedNodeRef.current = nodeData;
    // Also set in dataTransfer for browser compatibility
    event.dataTransfer.setData('application/node-info', JSON.stringify(nodeData));
    event.dataTransfer.setData('text/plain', JSON.stringify(nodeData));

     // Provide a compact drag preview so drop targets stay visible
    const preview = document.createElement('div');
    preview.textContent = node.title || `Node #${node.id}`;
    preview.style.position = 'fixed';
    preview.style.top = '-1000px';
    preview.style.left = '-1000px';
    preview.style.padding = '4px 8px';
    preview.style.background = '#0f0f0f';
    preview.style.color = '#f8fafc';
    preview.style.fontSize = '11px';
    preview.style.fontWeight = '600';
    preview.style.borderRadius = '6px';
    preview.style.border = '1px solid #1f1f1f';
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, 6, 6);
    setTimeout(() => {
      if (preview.parentNode) {
        preview.parentNode.removeChild(preview);
      }
    }, 0);
  };

  const handleNodeTileDragEnd = () => {
    // Clear ref if drag ends without a drop
    draggedNodeRef.current = null;
  };

  const handleDimensionDragOver = (event: DragEvent<HTMLElement>) => {
    if (event.dataTransfer.types.includes('application/node-info') || event.dataTransfer.types.includes('text/plain')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDimensionDragEnter = (event: DragEvent<HTMLElement>, dimension: string) => {
    if (event.dataTransfer.types.includes('application/node-info') || event.dataTransfer.types.includes('text/plain')) {
      setDragHoverDimension(dimension);
    }
  };

  const handleDimensionDragLeave = (event: DragEvent<HTMLElement>, dimension: string) => {
    if (dragHoverDimension === dimension) {
      setDragHoverDimension(null);
    }
  };

  const handleNodeDropOnDimension = async (event: DragEvent<HTMLElement>, dimension: string) => {
    event.preventDefault();
    event.stopPropagation();
    
    // Try to get data from ref first (works in Electron/Tauri webviews)
    let payload: { id: number; dimensions?: string[] } | null = draggedNodeRef.current;
    
    // Fallback to dataTransfer for browser compatibility
    if (!payload) {
      const raw = event.dataTransfer.getData('application/node-info') || event.dataTransfer.getData('text/plain');
      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch (e) {
          console.error('Failed to parse drag data:', e);
        }
      }
    }
    
    // Clear the ref
    draggedNodeRef.current = null;
    
    if (!payload?.id) {
      console.warn('No valid node data in drop event');
      return;
    }

    try {
      const currentDimensions = payload.dimensions || [];
      if (currentDimensions.some((dim) => dim.toLowerCase() === dimension.toLowerCase())) {
        setDragHoverDimension(null);
        return;
      }

      const updatedDimensions = Array.from(new Set([...currentDimensions, dimension]));
      const response = await fetch(`/api/nodes/${payload.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensions: updatedDimensions })
      });

      if (!response.ok) {
        throw new Error('Failed to update node dimensions');
      }

      if (selectedDimension?.dimension === dimension) {
        fetchNodes(true);
      }
      fetchDimensions();
      onDataChanged?.();
    } catch (error) {
      console.error('Error handling node drop:', error);
      alert('Failed to add dimension to node. Please try again.');
    } finally {
      setDragHoverDimension(null);
    }
  };

  const getContentPreview = (value?: string | null): string => {
    if (!value) return '';
    const trimmed = value.trim();
    if (trimmed.length <= 160) return trimmed;
    return `${trimmed.slice(0, 160)}…`;
  };

  const handleEditDescription = () => {
    if (!selectedDimension) return;
    setEditingDescription(true);
    setEditDescriptionText(selectedDimension.description || '');
  };

  const handleSaveDescription = async () => {
    if (!selectedDimension) return;

    try {
      const response = await fetch('/api/dimensions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: selectedDimension.dimension, 
          description: editDescriptionText.trim()
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update description');
      }

      // Update the local selectedDimension with new description
      setSelectedDimension(prev => prev ? { ...prev, description: editDescriptionText.trim() } : null);
      
      await fetchDimensions();
      onDataChanged?.();
      setEditingDescription(false);
      setEditDescriptionText('');
    } catch (error) {
      console.error('Error updating description:', error);
      alert('Failed to update description. Please try again.');
    }
  };

  const handleCancelDescription = () => {
    setEditingDescription(false);
    setEditDescriptionText('');
  };

  const handleEditDimensionName = () => {
    if (!selectedDimension) return;
    setEditingDimensionName(true);
    setEditDimensionNameText(selectedDimension.dimension);
  };

  const handleSaveDimensionName = async () => {
    if (!selectedDimension || !editDimensionNameText.trim()) return;

    const newName = editDimensionNameText.trim();
    if (newName === selectedDimension.dimension) {
      // No change, just cancel
      handleCancelDimensionName();
      return;
    }

    try {
      const response = await fetch('/api/dimensions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          currentName: selectedDimension.dimension,
          newName: newName,
          description: selectedDimension.description
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update dimension name');
      }

      // Update the local selectedDimension with new name
      setSelectedDimension(prev => prev ? { ...prev, dimension: newName } : null);
      
      await fetchDimensions();
      onDataChanged?.();
      setEditingDimensionName(false);
      setEditDimensionNameText('');
    } catch (error) {
      console.error('Error updating dimension name:', error);
      alert('Failed to update dimension name. Please try again.');
    }
  };

  const handleCancelDimensionName = () => {
    setEditingDimensionName(false);
    setEditDimensionNameText('');
  };

  const renderDimensionGrid = () => {
    if (dimensionsLoading) {
      return (
        <div style={{ padding: '40px', color: '#888', textAlign: 'center' }}>
          Loading dimensions...
        </div>
      );
    }

    if (dimensionsError) {
      return (
        <div style={{ padding: '40px', color: '#f87171', textAlign: 'center' }}>
          {dimensionsError}
        </div>
      );
    }

    if (sortedDimensions.length === 0) {
      return (
        <div style={{ padding: '40px', color: '#888', textAlign: 'center' }}>
          No dimensions yet. Create one to get started.
        </div>
      );
    }

    return (
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '10px',
          alignContent: 'start'
        }}
      >
        {sortedDimensions.map((dimension) => (
          <div
            key={dimension.dimension}
            role="button"
            tabIndex={0}
            onClick={() => handleSelectDimension(dimension)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleSelectDimension(dimension);
              }
            }}
            onDragOver={(event) => handleDimensionDragOver(event)}
            onDragEnter={(event) => handleDimensionDragEnter(event, dimension.dimension)}
            onDragLeave={(event) => handleDimensionDragLeave(event, dimension.dimension)}
            onDrop={(event) => handleNodeDropOnDimension(event, dimension.dimension)}
            style={{
              background: dragHoverDimension === dimension.dimension ? '#0d1a12' : '#0a0a0a',
              border: dimension.isPriority ? '1px solid #1a3a25' : '1px solid #1a1a1a',
              borderRadius: '10px',
              padding: '14px 16px',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (dragHoverDimension !== dimension.dimension) {
                e.currentTarget.style.background = '#111';
                e.currentTarget.style.borderColor = dimension.isPriority ? '#22c55e' : '#333';
              }
            }}
            onMouseLeave={(e) => {
              if (dragHoverDimension !== dimension.dimension) {
                e.currentTarget.style.background = '#0a0a0a';
                e.currentTarget.style.borderColor = dimension.isPriority ? '#1a3a25' : '#1a1a1a';
              }
            }}
          >
            {/* Folder icon */}
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: dimension.isPriority ? 'rgba(34, 197, 94, 0.1)' : '#111',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Folder size={16} style={{ color: dimension.isPriority ? '#22c55e' : '#666' }} />
            </div>

            {/* Name and count */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 600,
                color: dimension.isPriority ? '#22c55e' : '#e5e5e5',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {dimension.dimension}
              </div>
              {dimension.description && (
                <div style={{
                  fontSize: '11px',
                  color: '#666',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  marginTop: '2px'
                }}>
                  {dimension.description}
                </div>
              )}
            </div>

            {/* Count badge */}
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              color: dimension.isPriority ? '#22c55e' : '#666',
              background: dimension.isPriority ? 'rgba(34, 197, 94, 0.1)' : '#1a1a1a',
              padding: '4px 8px',
              borderRadius: '6px',
              flexShrink: 0
            }}>
              {dimension.count}
            </span>

            {/* Action buttons - show on hover via CSS would be ideal, but inline for now */}
            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleLock(dimension.dimension);
                }}
                title={dimension.isPriority ? 'Unpin' : 'Pin'}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: dimension.isPriority ? '#22c55e' : '#555',
                  transition: 'color 0.15s ease'
                }}
              >
                <Check size={14} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDimensionPendingDelete(dimension.dimension);
                }}
                title="Delete"
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: deletingDimension === dimension.dimension ? 'not-allowed' : 'pointer',
                  color: '#555',
                  opacity: deletingDimension === dimension.dimension ? 0.4 : 1,
                  transition: 'color 0.15s ease'
                }}
                disabled={deletingDimension === dimension.dimension}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Kanban helper functions
  const getNodesForKanbanColumn = (dimension: string) => {
    return nodes.filter(node => node.dimensions?.includes(dimension));
  };

  const handleAddKanbanColumn = (dimension: string) => {
    const newColumn = {
      dimension,
      order: kanbanColumns.length
    };
    setKanbanColumns([...kanbanColumns, newColumn]);
    setShowKanbanColumnPicker(false);
    setKanbanSearchQuery('');
  };

  const handleRemoveKanbanColumn = (dimension: string) => {
    setKanbanColumns(kanbanColumns.filter(c => c.dimension !== dimension));
  };

  const handleKanbanNodeDragStart = (e: DragEvent<HTMLDivElement>, nodeId: number, fromColumn: string) => {
    setDraggedNodeId(nodeId);
    setDraggedFromColumn(fromColumn);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleKanbanNodeDragEnd = () => {
    setDraggedNodeId(null);
    setDraggedFromColumn(null);
    setDragOverColumn(null);
  };

  const handleKanbanColumnDragOver = (e: DragEvent<HTMLDivElement>, columnDimension: string) => {
    e.preventDefault();
    if (draggedNodeId !== null) {
      setDragOverColumn(columnDimension);
    }
  };

  const handleKanbanColumnDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleKanbanNodeDrop = async (e: DragEvent<HTMLDivElement>, targetDimension: string) => {
    e.preventDefault();
    if (draggedNodeId === null || draggedFromColumn === targetDimension) {
      handleKanbanNodeDragEnd();
      return;
    }

    try {
      const node = nodes.find(n => n.id === draggedNodeId);
      if (!node) return;

      const currentDimensions = node.dimensions || [];
      let updatedDimensions: string[];

      if (draggedFromColumn === '__uncategorized__') {
        // Adding to a new dimension
        updatedDimensions = [...currentDimensions, targetDimension];
      } else {
        // Replace old dimension with new one
        updatedDimensions = currentDimensions.map(d =>
          d === draggedFromColumn ? targetDimension : d
        );
      }

      const response = await fetch(`/api/nodes/${draggedNodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensions: updatedDimensions })
      });

      if (!response.ok) {
        throw new Error('Failed to update node dimensions');
      }

      fetchNodes(true);
      onDataChanged?.();
    } catch (error) {
      console.error('Error updating node dimension:', error);
      alert('Failed to move node. Please try again.');
    } finally {
      handleKanbanNodeDragEnd();
    }
  };

  const filteredKanbanDimensions = dimensions.filter(d =>
    d.dimension.toLowerCase().includes(kanbanSearchQuery.toLowerCase()) &&
    !kanbanColumns.some(c => c.dimension === d.dimension) &&
    d.dimension !== selectedDimension?.dimension
  );

  const sortedKanbanColumns = [...kanbanColumns].sort((a, b) => a.order - b.order);

  // Render functions for each view mode
  const renderGridContent = () => (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 24px 24px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '16px',
        alignContent: 'start'
      }}
    >
      {nodes.map((node) => (
        <div
          key={node.id}
          draggable
          onDragStart={(event) => handleNodeTileDragStart(event, node)}
          onDragEnd={handleNodeTileDragEnd}
          onClick={() => {
            onNodeOpen(node.id);
            onClose();
          }}
          style={{
            background: '#0a0a0a',
            border: '1px solid #161616',
            borderRadius: '16px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative',
            minHeight: '200px',
            maxHeight: '200px',
            overflow: 'hidden',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.2)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#111111';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#0a0a0a';
            e.currentTarget.style.transform = 'translateY(0px)';
            e.currentTarget.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.2)';
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1 }}>
              <span style={{ flexShrink: 0 }}>
                {getNodeIcon(node)}
              </span>
              <div style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#f8fafc',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: '1.2'
              }}>
                {node.title || 'Untitled'}
              </div>
            </div>
            <span style={{
              fontSize: '10px',
              color: '#22c55e',
              background: 'rgba(34, 197, 94, 0.1)',
              padding: '2px 6px',
              borderRadius: '6px',
              fontWeight: 600,
              flexShrink: 0
            }}>
              #{node.id}
            </span>
          </div>
          {node.content && (
            <div style={{
              fontSize: '12px',
              color: '#94a3b8',
              lineHeight: '1.4',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              fontWeight: 400
            }}>
              {getContentPreview(node.content)}
            </div>
          )}
          {node.link && (
            <div style={{
              fontSize: '11px',
              color: '#60a5fa',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              background: 'rgba(96, 165, 250, 0.1)',
              padding: '4px 8px',
              borderRadius: '6px',
              fontWeight: 500
            }}>
              {node.link}
            </div>
          )}
          {node.dimensions && node.dimensions.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', overflow: 'hidden', flexWrap: 'wrap' }}>
              {node.dimensions.slice(0, 4).map((dimension, index) => {
                const isCurrentDimension = dimension === selectedDimension?.dimension;
                return (
                  <span
                    key={`${dimension}-${index}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '3px 8px',
                      fontSize: '10px',
                      fontWeight: 500,
                      color: isCurrentDimension ? '#7de8a5' : '#cbd5e1',
                      background: isCurrentDimension ? 'rgba(125, 232, 165, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                      border: isCurrentDimension ? '1px solid rgba(125, 232, 165, 0.3)' : '1px solid rgba(148, 163, 184, 0.2)',
                      borderRadius: '8px',
                      whiteSpace: 'nowrap',
                      textTransform: 'uppercase',
                      letterSpacing: '0.025em'
                    }}
                  >
                    {dimension}
                  </span>
                );
              })}
              {node.dimensions.length > 4 && (
                <span style={{
                  fontSize: '10px',
                  color: '#64748b',
                  fontWeight: 500,
                  padding: '3px 6px',
                  background: 'rgba(100, 116, 139, 0.1)',
                  borderRadius: '6px'
                }}>
                  +{node.dimensions.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
      {nodesLoading && (
        <div style={{ padding: '20px', color: '#888' }}>Loading...</div>
      )}
      {!nodesLoading && nodes.length === 0 && (
        <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#888', paddingTop: '40px' }}>
          No nodes in this dimension yet.
        </div>
      )}
    </div>
  );

  const renderListContent = () => (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 24px 24px'
      }}
    >
      {nodes.map((node) => (
        <button
          key={node.id}
          onClick={() => {
            onNodeOpen(node.id);
            onClose();
          }}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '12px 16px',
            marginBottom: '4px',
            background: '#0a0a0a',
            border: '1px solid #161616',
            borderRadius: '10px',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#111';
            e.currentTarget.style.borderColor = '#222';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#0a0a0a';
            e.currentTarget.style.borderColor = '#161616';
          }}
        >
          <div style={{
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#1a1a1a',
            borderRadius: '8px',
            flexShrink: 0
          }}>
            {getNodeIcon(node)}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#f8fafc',
              marginBottom: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {node.title || 'Untitled'}
            </div>

            {node.content && (
              <div style={{
                fontSize: '12px',
                color: '#94a3b8',
                marginBottom: '8px',
                lineHeight: '1.4',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}>
                {getContentPreview(node.content)}
              </div>
            )}

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              {node.dimensions && node.dimensions.length > 0 && (
                <div style={{
                  display: 'flex',
                  gap: '4px',
                  flexWrap: 'wrap'
                }}>
                  {node.dimensions.slice(0, 3).map(dim => {
                    const isCurrentDimension = dim === selectedDimension?.dimension;
                    return (
                      <span
                        key={dim}
                        style={{
                          padding: '2px 6px',
                          background: isCurrentDimension ? 'rgba(125, 232, 165, 0.15)' : '#1a1a1a',
                          borderRadius: '4px',
                          fontSize: '10px',
                          color: isCurrentDimension ? '#7de8a5' : '#888',
                          textTransform: 'uppercase'
                        }}
                      >
                        {dim}
                      </span>
                    );
                  })}
                  {node.dimensions.length > 3 && (
                    <span style={{
                      padding: '2px 6px',
                      fontSize: '10px',
                      color: '#666'
                    }}>
                      +{node.dimensions.length - 3}
                    </span>
                  )}
                </div>
              )}

              <span style={{
                fontSize: '10px',
                color: '#22c55e',
                background: 'rgba(34, 197, 94, 0.1)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 500
              }}>
                #{node.id}
              </span>
            </div>
          </div>
        </button>
      ))}
      {nodesLoading && (
        <div style={{ padding: '20px', color: '#888' }}>Loading...</div>
      )}
      {!nodesLoading && nodes.length === 0 && (
        <div style={{ textAlign: 'center', color: '#888', paddingTop: '40px' }}>
          No nodes in this dimension yet.
        </div>
      )}
    </div>
  );

  const renderKanbanContent = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Kanban Column Setup Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 24px',
        borderBottom: '1px solid #1a1a1a',
        background: '#0a0a0a',
        flexShrink: 0
      }}>
        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
          Group by:
        </span>

        {kanbanColumns.length === 0 && (
          <span style={{ fontSize: '11px', color: '#555', fontStyle: 'italic' }}>
            Add dimensions to create columns
          </span>
        )}

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowKanbanColumnPicker(!showKanbanColumnPicker)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#888',
              cursor: 'pointer'
            }}
          >
            <Plus size={12} />
            Add Column
          </button>

          {showKanbanColumnPicker && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              width: '200px',
              maxHeight: '300px',
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '8px',
              overflow: 'hidden',
              zIndex: 100,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}>
              <input
                type="text"
                placeholder="Search dimensions..."
                value={kanbanSearchQuery}
                onChange={(e) => setKanbanSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#0a0a0a',
                  border: 'none',
                  borderBottom: '1px solid #333',
                  color: '#fff',
                  fontSize: '12px',
                  outline: 'none'
                }}
                autoFocus
              />
              <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                {filteredKanbanDimensions.length === 0 ? (
                  <div style={{
                    padding: '12px',
                    fontSize: '12px',
                    color: '#666',
                    textAlign: 'center'
                  }}>
                    No dimensions available
                  </div>
                ) : (
                  filteredKanbanDimensions.map(dim => (
                    <button
                      key={dim.dimension}
                      onClick={() => handleAddKanbanColumn(dim.dimension)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'transparent',
                        border: 'none',
                        color: '#ccc',
                        fontSize: '12px',
                        textAlign: 'left',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a2a'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {dim.dimension}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {showKanbanColumnPicker && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
            onClick={() => setShowKanbanColumnPicker(false)}
          />
        )}
      </div>

      {/* Kanban Board */}
      <div style={{
        flex: 1,
        display: 'flex',
        gap: '16px',
        padding: '16px 24px',
        overflowX: 'auto',
        overflowY: 'hidden'
      }}>
        {sortedKanbanColumns.map(column => {
          const columnNodes = getNodesForKanbanColumn(column.dimension);
          const isDropTarget = dragOverColumn === column.dimension && draggedFromColumn !== column.dimension;

          return (
            <div
              key={column.dimension}
              style={{
                width: '280px',
                minWidth: '280px',
                display: 'flex',
                flexDirection: 'column',
                background: isDropTarget ? '#0f2417' : '#0a0a0a',
                border: '1px solid #1a1a1a',
                borderRadius: '12px',
                transition: 'all 0.2s'
              }}
              onDragOver={(e) => handleKanbanColumnDragOver(e, column.dimension)}
              onDragLeave={handleKanbanColumnDragLeave}
              onDrop={(e) => handleKanbanNodeDrop(e, column.dimension)}
            >
              {/* Column Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                borderBottom: '1px solid #1a1a1a'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#f8fafc',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    {column.dimension}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    color: '#666',
                    background: '#1a1a1a',
                    padding: '2px 6px',
                    borderRadius: '10px'
                  }}>
                    {columnNodes.length}
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveKanbanColumn(column.dimension)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px',
                    cursor: 'pointer',
                    color: '#666',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Column Content */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '8px'
              }}>
                {columnNodes.map(node => (
                  <div
                    key={node.id}
                    draggable
                    onDragStart={(e) => handleKanbanNodeDragStart(e, node.id, column.dimension)}
                    onDragEnd={handleKanbanNodeDragEnd}
                    onClick={() => {
                      onNodeOpen(node.id);
                      onClose();
                    }}
                    style={{
                      padding: '10px',
                      marginBottom: '6px',
                      background: draggedNodeId === node.id ? '#1a1a1a' : '#111',
                      border: '1px solid #222',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      opacity: draggedNodeId === node.id ? 0.5 : 1,
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (draggedNodeId !== node.id) {
                        e.currentTarget.style.background = '#1a1a1a';
                        e.currentTarget.style.borderColor = '#333';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (draggedNodeId !== node.id) {
                        e.currentTarget.style.background = '#111';
                        e.currentTarget.style.borderColor = '#222';
                      }
                    }}
                  >
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#f8fafc',
                      marginBottom: '4px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {node.title || 'Untitled'}
                    </div>
                    {node.dimensions && node.dimensions.length > 1 && (
                      <div style={{
                        display: 'flex',
                        gap: '4px',
                        flexWrap: 'wrap',
                        marginTop: '6px'
                      }}>
                        {node.dimensions
                          .filter(d => d !== column.dimension && d !== selectedDimension?.dimension)
                          .slice(0, 2)
                          .map(dim => (
                            <span
                              key={dim}
                              style={{
                                padding: '2px 6px',
                                background: '#1a1a1a',
                                borderRadius: '4px',
                                fontSize: '10px',
                                color: '#666'
                              }}
                            >
                              {dim}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                ))}

                {columnNodes.length === 0 && (
                  <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: '#444',
                    fontSize: '11px'
                  }}>
                    Drop nodes here
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Empty State */}
        {kanbanColumns.length === 0 && (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: '13px'
          }}>
            Add dimension columns to organize your nodes
          </div>
        )}
      </div>
    </div>
  );

  // Render all nodes view (list or kanban) - shown at top level when not in folder view
  const renderAllNodesView = () => {
    if (allNodesLoading) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
          Loading nodes...
        </div>
      );
    }

    if (viewMode === 'list') {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '0 24px 12px', color: '#94a3b8', fontSize: '12px', fontWeight: 500 }}>
            Showing <strong style={{ color: '#f8fafc' }}>{allNodes.length}</strong> nodes
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
            {allNodes.map((node) => (
              <button
                key={node.id}
                onClick={() => {
                  onNodeOpen(node.id);
                  onClose();
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px 16px',
                  marginBottom: '4px',
                  background: '#0a0a0a',
                  border: '1px solid #161616',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#111';
                  e.currentTarget.style.borderColor = '#222';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#0a0a0a';
                  e.currentTarget.style.borderColor = '#161616';
                }}
              >
                <div style={{
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#1a1a1a',
                  borderRadius: '8px',
                  flexShrink: 0
                }}>
                  {getNodeIcon(node)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#f8fafc',
                    marginBottom: '4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {node.title || 'Untitled'}
                  </div>

                  {node.content && (
                    <div style={{
                      fontSize: '12px',
                      color: '#94a3b8',
                      marginBottom: '8px',
                      lineHeight: '1.4',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {getContentPreview(node.content)}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {node.dimensions && node.dimensions.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {node.dimensions.slice(0, 3).map(dim => (
                          <span
                            key={dim}
                            style={{
                              padding: '2px 6px',
                              background: '#1a1a1a',
                              borderRadius: '4px',
                              fontSize: '10px',
                              color: '#888',
                              textTransform: 'uppercase'
                            }}
                          >
                            {dim}
                          </span>
                        ))}
                        {node.dimensions.length > 3 && (
                          <span style={{ padding: '2px 6px', fontSize: '10px', color: '#666' }}>
                            +{node.dimensions.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    <span style={{
                      fontSize: '10px',
                      color: '#22c55e',
                      background: 'rgba(34, 197, 94, 0.1)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontWeight: 500
                    }}>
                      #{node.id}
                    </span>
                  </div>
                </div>
              </button>
            ))}
            {allNodes.length === 0 && (
              <div style={{ textAlign: 'center', color: '#888', paddingTop: '40px' }}>
                No nodes yet.
              </div>
            )}
          </div>
        </div>
      );
    }

    if (viewMode === 'kanban') {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Kanban Column Setup Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 24px',
            borderBottom: '1px solid #1a1a1a',
            background: '#0a0a0a',
            flexShrink: 0
          }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
              Group by:
            </span>

            {kanbanColumns.length === 0 && (
              <span style={{ fontSize: '11px', color: '#555', fontStyle: 'italic' }}>
                Add dimensions to create columns
              </span>
            )}

            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowKanbanColumnPicker(!showKanbanColumnPicker)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: '#888',
                  cursor: 'pointer'
                }}
              >
                <Plus size={12} />
                Add Column
              </button>

              {showKanbanColumnPicker && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  width: '200px',
                  maxHeight: '300px',
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  zIndex: 100,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                }}>
                  <input
                    type="text"
                    placeholder="Search dimensions..."
                    value={kanbanSearchQuery}
                    onChange={(e) => setKanbanSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: '#0a0a0a',
                      border: 'none',
                      borderBottom: '1px solid #333',
                      color: '#fff',
                      fontSize: '12px',
                      outline: 'none'
                    }}
                    autoFocus
                  />
                  <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                    {dimensions.filter(d =>
                      d.dimension.toLowerCase().includes(kanbanSearchQuery.toLowerCase()) &&
                      !kanbanColumns.some(c => c.dimension === d.dimension)
                    ).length === 0 ? (
                      <div style={{
                        padding: '12px',
                        fontSize: '12px',
                        color: '#666',
                        textAlign: 'center'
                      }}>
                        No dimensions available
                      </div>
                    ) : (
                      dimensions.filter(d =>
                        d.dimension.toLowerCase().includes(kanbanSearchQuery.toLowerCase()) &&
                        !kanbanColumns.some(c => c.dimension === d.dimension)
                      ).map(dim => (
                        <button
                          key={dim.dimension}
                          onClick={() => handleAddKanbanColumn(dim.dimension)}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            background: 'transparent',
                            border: 'none',
                            color: '#ccc',
                            fontSize: '12px',
                            textAlign: 'left',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a2a'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          {dim.dimension}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {showKanbanColumnPicker && (
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                onClick={() => setShowKanbanColumnPicker(false)}
              />
            )}
          </div>

          {/* Kanban Board */}
          <div style={{
            flex: 1,
            display: 'flex',
            gap: '16px',
            padding: '16px 24px',
            overflowX: 'auto',
            overflowY: 'hidden'
          }}>
            {sortedKanbanColumns.map(column => {
              const columnNodes = allNodes.filter(node => node.dimensions?.includes(column.dimension));
              const isDropTarget = dragOverColumn === column.dimension && draggedFromColumn !== column.dimension;

              return (
                <div
                  key={column.dimension}
                  style={{
                    width: '280px',
                    minWidth: '280px',
                    display: 'flex',
                    flexDirection: 'column',
                    background: isDropTarget ? '#0f2417' : '#0a0a0a',
                    border: '1px solid #1a1a1a',
                    borderRadius: '12px',
                    transition: 'all 0.2s'
                  }}
                  onDragOver={(e) => handleKanbanColumnDragOver(e, column.dimension)}
                  onDragLeave={handleKanbanColumnDragLeave}
                  onDrop={(e) => handleAllNodesKanbanDrop(e, column.dimension)}
                >
                  {/* Column Header */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    borderBottom: '1px solid #1a1a1a'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#f8fafc',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        {column.dimension}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        color: '#666',
                        background: '#1a1a1a',
                        padding: '2px 6px',
                        borderRadius: '10px'
                      }}>
                        {columnNodes.length}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveKanbanColumn(column.dimension)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: '4px',
                        cursor: 'pointer',
                        color: '#666',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Column Content */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                    {columnNodes.map(node => (
                      <div
                        key={node.id}
                        draggable
                        onDragStart={(e) => handleKanbanNodeDragStart(e, node.id, column.dimension)}
                        onDragEnd={handleKanbanNodeDragEnd}
                        onClick={() => {
                          onNodeOpen(node.id);
                          onClose();
                        }}
                        style={{
                          padding: '10px',
                          marginBottom: '6px',
                          background: draggedNodeId === node.id ? '#1a1a1a' : '#111',
                          border: '1px solid #222',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          opacity: draggedNodeId === node.id ? 0.5 : 1,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (draggedNodeId !== node.id) {
                            e.currentTarget.style.background = '#1a1a1a';
                            e.currentTarget.style.borderColor = '#333';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (draggedNodeId !== node.id) {
                            e.currentTarget.style.background = '#111';
                            e.currentTarget.style.borderColor = '#222';
                          }
                        }}
                      >
                        <div style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#f8fafc',
                          marginBottom: '4px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {node.title || 'Untitled'}
                        </div>
                        {node.dimensions && node.dimensions.length > 1 && (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                            {node.dimensions
                              .filter(d => d !== column.dimension)
                              .slice(0, 2)
                              .map(dim => (
                                <span
                                  key={dim}
                                  style={{
                                    padding: '2px 6px',
                                    background: '#1a1a1a',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    color: '#666'
                                  }}
                                >
                                  {dim}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {columnNodes.length === 0 && (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#444', fontSize: '11px' }}>
                        Drop nodes here
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Empty State */}
            {kanbanColumns.length === 0 && (
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                fontSize: '13px'
              }}>
                Add dimension columns to organize your nodes
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  // Handle kanban drop for all nodes view
  const handleAllNodesKanbanDrop = async (e: DragEvent<HTMLDivElement>, targetDimension: string) => {
    e.preventDefault();
    if (draggedNodeId === null || draggedFromColumn === targetDimension) {
      handleKanbanNodeDragEnd();
      return;
    }

    try {
      const node = allNodes.find(n => n.id === draggedNodeId);
      if (!node) return;

      const currentDimensions = node.dimensions || [];
      let updatedDimensions: string[];

      if (draggedFromColumn === '__uncategorized__') {
        updatedDimensions = [...currentDimensions, targetDimension];
      } else {
        updatedDimensions = currentDimensions.map(d =>
          d === draggedFromColumn ? targetDimension : d
        );
      }

      const response = await fetch(`/api/nodes/${draggedNodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensions: updatedDimensions })
      });

      if (!response.ok) {
        throw new Error('Failed to update node dimensions');
      }

      fetchAllNodes();
      onDataChanged?.();
    } catch (error) {
      console.error('Error updating node dimension:', error);
      alert('Failed to move node. Please try again.');
    } finally {
      handleKanbanNodeDragEnd();
    }
  };

  const renderNodeGrid = () => {
    if (!selectedDimension) return null;

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '0 24px 12px', color: '#94a3b8', fontSize: '12px', fontWeight: 500 }}>
          Showing <strong style={{ color: '#f8fafc' }}>{nodes.length}</strong> nodes tagged with <strong style={{ color: '#7de8a5' }}>{selectedDimension.dimension.toUpperCase()}</strong>
        </div>

        {renderGridContent()}

        {nodesError && (
          <div style={{ padding: '12px 16px', color: '#f87171', fontSize: '12px' }}>
            {nodesError}
          </div>
        )}
        {hasMoreNodes && (
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <button
              onClick={() => fetchNodes(false)}
              disabled={nodesLoading}
              style={{
                padding: '10px 18px',
                borderRadius: '999px',
                border: '1px solid #1f1f1f',
                background: '#111',
                color: '#f1f5f9',
                cursor: nodesLoading ? 'not-allowed' : 'pointer'
              }}
            >
              {nodesLoading ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    );
  };

  // Render filtered view content based on viewMode
  const renderFilteredView = () => {
    if (filteredNodesLoading) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
          Loading...
        </div>
      );
    }

    if (selectedFilters.length === 0) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '13px' }}>
          Select dimension filters to view nodes
        </div>
      );
    }

    if (filteredNodes.length === 0) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '13px' }}>
          No nodes match the selected filters
        </div>
      );
    }

    // List view with dimension grouping
    if (viewMode === 'list') {
      const groups = getNodesGroupedByDimension();
      return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {groups.map(group => (
            <div key={group.dimension} style={{ marginBottom: '24px' }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#22c55e',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                padding: '8px 0',
                borderBottom: '1px solid #1a1a1a',
                marginBottom: '8px'
              }}>
                {group.dimension} ({group.nodes.length})
              </div>
              {group.nodes.map((node, index) => (
                <div
                  key={node.id}
                  draggable
                  onDragStart={(e) => {
                    setReorderDrag({ nodeId: node.id, dimension: group.dimension, index });
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    setReorderDrag(null);
                    setReorderDropIndex(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (reorderDrag && reorderDrag.dimension === group.dimension && reorderDrag.nodeId !== node.id) {
                      setReorderDropIndex(index);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (reorderDrag && reorderDrag.dimension === group.dimension) {
                      handleReorderDrop(group.dimension, reorderDrag.index, index, group.nodes);
                    }
                  }}
                  onClick={() => {
                    onNodeOpen(node.id);
                    onClose();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    marginBottom: '2px',
                    background: reorderDrag?.nodeId === node.id ? '#1a2a1f' : 'transparent',
                    border: reorderDropIndex === index && reorderDrag?.dimension === group.dimension && reorderDrag?.nodeId !== node.id
                      ? '1px dashed #22c55e'
                      : '1px solid transparent',
                    borderRadius: '6px',
                    cursor: 'grab',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                    opacity: reorderDrag?.nodeId === node.id ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!reorderDrag) e.currentTarget.style.background = '#111';
                  }}
                  onMouseLeave={(e) => {
                    if (!reorderDrag) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={{
                    fontSize: '10px',
                    color: '#555',
                    cursor: 'grab',
                    userSelect: 'none'
                  }}>⋮⋮</span>
                  <span style={{
                    fontSize: '10px',
                    color: '#22c55e',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    opacity: 0.7
                  }}>
                    {node.id}
                  </span>
                  <div style={{
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {getNodeIcon(node)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#e5e5e5',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {node.title || 'Untitled'}
                    </div>
                  </div>
                  {node.dimensions && node.dimensions.length > 1 && (
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                      {node.dimensions
                        .filter(d => d !== group.dimension)
                        .slice(0, 2)
                        .map(dim => (
                          <span
                            key={dim}
                            style={{
                              padding: '2px 5px',
                              background: selectedFilters.includes(dim) ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                              borderRadius: '3px',
                              fontSize: '9px',
                              color: selectedFilters.includes(dim) ? '#22c55e' : '#444',
                              fontWeight: 500
                            }}
                          >
                            {dim}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }

    // Grid view with dimension grouping
    if (viewMode === 'grid') {
      const groups = getNodesGroupedByDimension();
      return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {groups.map(group => (
            <div key={group.dimension} style={{ marginBottom: '32px' }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#22c55e',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                padding: '8px 0',
                borderBottom: '1px solid #1a1a1a',
                marginBottom: '16px'
              }}>
                {group.dimension} ({group.nodes.length})
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '10px'
                }}
              >
                {group.nodes.map((node, index) => (
                  <div
                    key={node.id}
                    draggable
                    onDragStart={(e) => {
                      setReorderDrag({ nodeId: node.id, dimension: group.dimension, index });
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => {
                      setReorderDrag(null);
                      setReorderDropIndex(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (reorderDrag && reorderDrag.dimension === group.dimension && reorderDrag.nodeId !== node.id) {
                        setReorderDropIndex(index);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (reorderDrag && reorderDrag.dimension === group.dimension) {
                        handleReorderDrop(group.dimension, reorderDrag.index, index, group.nodes);
                      }
                    }}
                    onClick={() => {
                      onNodeOpen(node.id);
                      onClose();
                    }}
                    style={{
                      background: reorderDrag?.nodeId === node.id ? '#1a2a1f' : '#0a0a0a',
                      border: reorderDropIndex === index && reorderDrag?.dimension === group.dimension && reorderDrag?.nodeId !== node.id
                        ? '2px dashed #22c55e'
                        : '1px solid #161616',
                      borderRadius: '10px',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      cursor: 'grab',
                      transition: 'all 0.15s ease',
                      minHeight: '120px',
                      maxHeight: '140px',
                      overflow: 'hidden',
                      opacity: reorderDrag?.nodeId === node.id ? 0.5 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!reorderDrag) {
                        e.currentTarget.style.background = '#111';
                        e.currentTarget.style.borderColor = '#222';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!reorderDrag) {
                        e.currentTarget.style.background = '#0a0a0a';
                        e.currentTarget.style.borderColor = '#161616';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{
                        fontSize: '10px',
                        color: '#555',
                        cursor: 'grab',
                        userSelect: 'none',
                        marginTop: '2px'
                      }}>⋮⋮</span>
                      <span style={{
                        fontSize: '10px',
                        color: '#22c55e',
                        fontWeight: 600,
                        fontFamily: 'monospace',
                        opacity: 0.7,
                        marginTop: '2px'
                      }}>
                        {node.id}
                      </span>
                      <span style={{ flexShrink: 0, marginTop: '1px' }}>{getNodeIcon(node)}</span>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#e5e5e5',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1
                      }}>
                        {node.title || 'Untitled'}
                      </div>
                    </div>
                    {node.content && (
                      <div style={{
                        fontSize: '11px',
                        color: '#666',
                        lineHeight: '1.4',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                      }}>
                        {getContentPreview(node.content)}
                      </div>
                    )}
                    {node.dimensions && node.dimensions.length > 1 && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: 'auto' }}>
                        {node.dimensions.filter(d => d !== group.dimension).slice(0, 2).map((dim) => (
                          <span
                            key={dim}
                            style={{
                              padding: '2px 5px',
                              fontSize: '9px',
                              fontWeight: 500,
                              color: selectedFilters.includes(dim) ? '#22c55e' : '#555',
                              background: selectedFilters.includes(dim) ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                              borderRadius: '3px'
                            }}
                          >
                            {dim}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    // Kanban view - group by selected filters with drag-and-drop
    if (viewMode === 'kanban') {
      return (
        <div style={{
          flex: 1,
          display: 'flex',
          gap: '16px',
          padding: '16px 24px',
          overflowX: 'auto',
          overflowY: 'hidden'
        }}>
          {selectedFilters.map(dimension => {
            const unsortedColumnNodes = filteredNodes.filter(n => n.dimensions?.includes(dimension));
            const columnNodes = sortNodesByDimensionOrder(unsortedColumnNodes, dimension);
            const isDropTarget = dropTargetDimension === dimension;
            const isColumnDropTarget = columnDropTarget === dimension && draggedColumn !== dimension;
            const isBeingDragged = draggedColumn === dimension;
            return (
              <div
                key={dimension}
                onDragOver={(e) => {
                  e.preventDefault();
                  // If dragging a column, set column drop target
                  if (draggedColumn) {
                    setColumnDropTarget(dimension);
                  } else {
                    setDropTargetDimension(dimension);
                  }
                }}
                onDragLeave={(e) => {
                  // Only clear if leaving the column entirely
                  if (!e.currentTarget.contains(e.relatedTarget as HTMLElement)) {
                    setDropTargetDimension(null);
                    setColumnDropTarget(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  // Handle column reorder
                  if (draggedColumn && draggedColumn !== dimension) {
                    handleColumnReorder(draggedColumn, dimension);
                    setDraggedColumn(null);
                    setColumnDropTarget(null);
                  }
                  // Handle node drop
                  else if (draggedNode && draggedNode.fromDimension !== dimension) {
                    handleKanbanDrop(draggedNode.id, draggedNode.fromDimension, dimension);
                  }
                  setDraggedNode(null);
                  setDropTargetDimension(null);
                }}
                style={{
                  width: '280px',
                  minWidth: '280px',
                  display: 'flex',
                  flexDirection: 'column',
                  background: isColumnDropTarget ? '#1a1a2a' : (isDropTarget ? '#0d1a12' : '#0a0a0a'),
                  border: isColumnDropTarget ? '1px solid #6366f1' : (isDropTarget ? '1px solid #22c55e' : '1px solid #1a1a1a'),
                  borderRadius: '12px',
                  transition: 'all 0.15s ease',
                  opacity: isBeingDragged ? 0.5 : 1
                }}
              >
                {/* Column header - draggable for reordering */}
                <div
                  draggable
                  onDragStart={(e) => {
                    setDraggedColumn(dimension);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    setDraggedColumn(null);
                    setColumnDropTarget(null);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    borderBottom: '1px solid #1a1a1a',
                    cursor: 'grab',
                    userSelect: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '10px',
                      color: '#555',
                      cursor: 'grab'
                    }}>⋮⋮</span>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#f8fafc',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      {dimension}
                    </span>
                    <span style={{
                      fontSize: '11px',
                      color: '#666',
                      background: '#1a1a1a',
                      padding: '2px 6px',
                      borderRadius: '10px'
                    }}>
                      {columnNodes.length}
                    </span>
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                  {columnNodes.map((node, index) => {
                    const isReorderTarget = reorderDropIndex === index && reorderDrag?.dimension === dimension && reorderDrag?.nodeId !== node.id;
                    return (
                    <div
                      key={node.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggedNode({ id: node.id, fromDimension: dimension });
                        setReorderDrag({ nodeId: node.id, dimension, index });
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => {
                        setDraggedNode(null);
                        setDropTargetDimension(null);
                        setReorderDrag(null);
                        setReorderDropIndex(null);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // If dragging within same column, show reorder indicator
                        if (reorderDrag && reorderDrag.dimension === dimension && reorderDrag.nodeId !== node.id) {
                          setReorderDropIndex(index);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Handle within-column reorder
                        if (reorderDrag && reorderDrag.dimension === dimension && reorderDrag.nodeId !== node.id) {
                          handleReorderDrop(dimension, reorderDrag.index, index, columnNodes);
                        }
                      }}
                      onClick={() => {
                        onNodeOpen(node.id);
                        onClose();
                      }}
                      style={{
                        padding: '10px',
                        marginBottom: '6px',
                        background: draggedNode?.id === node.id ? '#1a2a1f' : '#111',
                        border: isReorderTarget ? '2px dashed #22c55e' : (draggedNode?.id === node.id ? '1px solid #22c55e' : '1px solid #222'),
                        borderRadius: '8px',
                        cursor: 'grab',
                        transition: 'all 0.15s',
                        userSelect: 'none',
                        opacity: draggedNode?.id === node.id ? 0.5 : 1
                      }}
                      onMouseEnter={(e) => {
                        if (!draggedNode) {
                          e.currentTarget.style.background = '#1a1a1a';
                          e.currentTarget.style.borderColor = '#333';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!draggedNode) {
                          e.currentTarget.style.background = '#111';
                          e.currentTarget.style.borderColor = '#222';
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                        <span style={{
                          fontSize: '10px',
                          color: '#555',
                          cursor: 'grab',
                          userSelect: 'none'
                        }}>⋮⋮</span>
                        <span style={{
                          fontSize: '9px',
                          color: '#22c55e',
                          fontWeight: 600,
                          fontFamily: 'monospace',
                          opacity: 0.7,
                          marginTop: '2px'
                        }}>
                          {node.id}
                        </span>
                        <div style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#e5e5e5',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1
                        }}>
                          {node.title || 'Untitled'}
                        </div>
                      </div>
                      {node.dimensions && node.dimensions.length > 1 && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                          {node.dimensions
                            .filter(d => d !== dimension)
                            .slice(0, 2)
                            .map(dim => (
                              <span
                                key={dim}
                                style={{
                                  padding: '2px 5px',
                                  background: selectedFilters.includes(dim) ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                                  borderRadius: '3px',
                                  fontSize: '9px',
                                  fontWeight: 500,
                                  color: selectedFilters.includes(dim) ? '#22c55e' : '#555'
                                }}
                              >
                                {dim}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  );})}
                  {columnNodes.length === 0 && (
                    <div style={{
                      padding: '20px',
                      textAlign: 'center',
                      color: isDropTarget ? '#22c55e' : '#444',
                      fontSize: '11px',
                      border: isDropTarget ? '2px dashed #22c55e' : '2px dashed transparent',
                      borderRadius: '8px',
                      transition: 'all 0.15s ease'
                    }}>
                      {isDropTarget ? 'Drop here' : 'No nodes'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return null;
  };

  return (
    <>
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#050505',
        borderRadius: '4px',
        border: '1px solid #1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 5
      }}
    >
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1a1a1a' }}>
        {/* Top row: Mode tabs + Actions */}
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Back button when viewing nodes in a dimension */}
            {view === 'nodes' && (
              <button
                onClick={handleBackToDimensions}
                style={{
                  padding: '6px',
                  borderRadius: '6px',
                  border: '1px solid #1f1f1f',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#cbd5f5'
                }}
              >
                <ArrowLeft size={16} />
              </button>
            )}

            {/* Mode tabs - only show when not drilling into a specific dimension */}
            {view === 'dimensions' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button
                  onClick={() => {
                    setOverlayMode('folders');
                    setActiveViewId(null);
                  }}
                  style={{
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: overlayMode === 'folders' ? '#f8fafc' : '#555',
                    fontSize: '13px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'color 0.15s'
                  }}
                >
                  <Folder size={14} style={{ color: overlayMode === 'folders' ? '#22c55e' : '#555' }} />
                  Folders
                </button>
                <button
                  onClick={() => setOverlayMode('filtered')}
                  style={{
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: overlayMode === 'filtered' ? '#f8fafc' : '#555',
                    fontSize: '13px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'color 0.15s'
                  }}
                >
                  <Filter size={14} style={{ color: overlayMode === 'filtered' ? '#22c55e' : '#555' }} />
                  {activeView ? activeView.name : 'Filter'}
                </button>
              </div>
            )}

            {/* Title when viewing nodes in a dimension */}
            {view === 'nodes' && (
              <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Nodes –</span>
                <span style={{ color: '#22c55e' }}>{selectedDimension?.dimension ?? ''}</span>
              </div>
            )}

            {/* Saved views dropdown */}
            {view === 'dimensions' && savedViews.length > 0 && (
              <div style={{ position: 'relative', marginLeft: '8px' }}>
                <button
                  onClick={() => setShowSavedViewsDropdown(!showSavedViewsDropdown)}
                  style={{
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#555',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'color 0.15s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#888'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; }}
                >
                  <Save size={12} />
                  <ChevronDown size={10} />
                </button>
                {showSavedViewsDropdown && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                      onClick={() => setShowSavedViewsDropdown(false)}
                    />
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '4px',
                      minWidth: '200px',
                      background: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      zIndex: 100,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                    }}>
                      {savedViews.map(sv => (
                        <div
                          key={sv.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            background: activeViewId === sv.id ? '#2a2a2a' : 'transparent'
                          }}
                          onMouseEnter={(e) => { if (activeViewId !== sv.id) e.currentTarget.style.background = '#252525'; }}
                          onMouseLeave={(e) => { if (activeViewId !== sv.id) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span
                            onClick={() => loadSavedView(sv)}
                            style={{ flex: 1, fontSize: '12px', color: '#ccc' }}
                          >
                            {sv.name}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSavedView(sv.id);
                            }}
                            style={{
                              padding: '4px',
                              background: 'none',
                              border: 'none',
                              color: '#666',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Add Dimension button - only in folders mode */}
            {view === 'dimensions' && overlayMode === 'folders' && (
              <button
                onClick={() => setShowAddDimensionDialog(true)}
                title="Add dimension"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  color: '#555',
                  background: 'transparent',
                  border: '1px solid #1f1f1f',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#22c55e'; e.currentTarget.style.borderColor = '#22c55e'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; e.currentTarget.style.borderColor = '#1f1f1f'; }}
              >
                <Plus size={14} />
              </button>
            )}

            {/* View mode toggle - only in filtered mode with filters */}
            {view === 'dimensions' && overlayMode === 'filtered' && selectedFilters.length > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                padding: '2px',
                background: '#0a0a0a',
                borderRadius: '6px',
                border: '1px solid #1f1f1f'
              }}>
                <button
                  onClick={() => setViewMode('list')}
                  title="List view"
                  style={{
                    padding: '4px',
                    borderRadius: '4px',
                    border: 'none',
                    background: viewMode === 'list' ? '#1f1f1f' : 'transparent',
                    cursor: 'pointer',
                    color: viewMode === 'list' ? '#22c55e' : '#555',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'all 0.15s'
                  }}
                >
                  <List size={14} />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  title="Grid view"
                  style={{
                    padding: '4px',
                    borderRadius: '4px',
                    border: 'none',
                    background: viewMode === 'grid' ? '#1f1f1f' : 'transparent',
                    cursor: 'pointer',
                    color: viewMode === 'grid' ? '#22c55e' : '#555',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'all 0.15s'
                  }}
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  onClick={() => setViewMode('kanban')}
                  title="Kanban view"
                  style={{
                    padding: '4px',
                    borderRadius: '4px',
                    border: 'none',
                    background: viewMode === 'kanban' ? '#1f1f1f' : 'transparent',
                    cursor: 'pointer',
                    color: viewMode === 'kanban' ? '#22c55e' : '#555',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'all 0.15s'
                  }}
                >
                  <Columns3 size={14} />
                </button>
              </div>
            )}

            {/* Save View button - only in filtered mode with filters */}
            {view === 'dimensions' && overlayMode === 'filtered' && selectedFilters.length > 0 && (
              <button
                onClick={() => setShowSaveViewDialog(true)}
                title="Save view"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  color: '#555',
                  background: 'transparent',
                  border: '1px solid #1f1f1f',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#22c55e'; e.currentTarget.style.borderColor = '#22c55e'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; e.currentTarget.style.borderColor = '#1f1f1f'; }}
              >
                <Save size={14} />
              </button>
            )}

            <button
              onClick={onClose}
              title="Close"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                border: '1px solid #1f1f1f',
                background: 'transparent',
                cursor: 'pointer',
                color: '#555',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.background = '#1a1a1a'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#555'; e.currentTarget.style.background = 'transparent'; }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Filter bar - only show in filtered mode */}
        {view === 'dimensions' && overlayMode === 'filtered' && (
          <div style={{
            padding: '0 16px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap'
          }}>
            {/* Filter chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
              {selectedFilters.map(filter => (
                <span
                  key={filter}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 6px',
                    background: 'rgba(34, 197, 94, 0.1)',
                    borderRadius: '4px',
                    fontSize: '10px',
                    color: '#22c55e',
                    fontWeight: 500,
                    letterSpacing: '0.02em'
                  }}
                >
                  {filter}
                  <button
                    onClick={() => removeFilter(filter)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: '#22c55e',
                      display: 'flex',
                      alignItems: 'center',
                      opacity: 0.7,
                      transition: 'opacity 0.15s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}

              {/* Add filter button */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowFilterPicker(!showFilterPicker)}
                  title="Add filter"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '20px',
                    height: '20px',
                    background: 'transparent',
                    border: '1px dashed #333',
                    borderRadius: '4px',
                    color: '#555',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.color = '#22c55e'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#555'; }}
                >
                  <Plus size={12} />
                </button>
                {showFilterPicker && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                      onClick={() => setShowFilterPicker(false)}
                    />
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '4px',
                      width: '200px',
                      maxHeight: '300px',
                      background: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      zIndex: 100,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                    }}>
                      <input
                        type="text"
                        placeholder="Search dimensions..."
                        value={filterSearchQuery}
                        onChange={(e) => setFilterSearchQuery(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          background: '#0a0a0a',
                          border: 'none',
                          borderBottom: '1px solid #333',
                          color: '#fff',
                          fontSize: '12px',
                          outline: 'none'
                        }}
                        autoFocus
                      />
                      <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                        {dimensions
                          .filter(d =>
                            d.dimension.toLowerCase().includes(filterSearchQuery.toLowerCase()) &&
                            !selectedFilters.includes(d.dimension)
                          )
                          .map(dim => (
                            <button
                              key={dim.dimension}
                              onClick={() => addFilter(dim.dimension)}
                              style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'transparent',
                                border: 'none',
                                color: '#ccc',
                                fontSize: '12px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a2a'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              <span>{dim.dimension}</span>
                              <span style={{ fontSize: '10px', color: '#666' }}>{dim.count}</span>
                            </button>
                          ))}
                        {dimensions.filter(d =>
                          d.dimension.toLowerCase().includes(filterSearchQuery.toLowerCase()) &&
                          !selectedFilters.includes(d.dimension)
                        ).length === 0 && (
                          <div style={{ padding: '12px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
                            No dimensions available
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {selectedFilters.length > 0 && (
                <button
                  onClick={clearFilters}
                  title="Clear all filters"
                  style={{
                    padding: 0,
                    marginLeft: '4px',
                    background: 'transparent',
                    border: 'none',
                    fontSize: '10px',
                    color: '#444',
                    cursor: 'pointer',
                    transition: 'color 0.15s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#888'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#444'; }}
                >
                  clear
                </button>
              )}
            </div>

          </div>
        )}
      </div>

      {/* Content */}
      {view === 'nodes' ? (
        renderNodeGrid()
      ) : overlayMode === 'folders' ? (
        renderDimensionGrid()
      ) : (
        renderFilteredView()
      )}
    </div>
    <ConfirmDialog
      open={dimensionPendingDelete !== null}
      title="Delete this dimension?"
      message={`This will remove "${dimensionPendingDelete ?? ''}" from every node.`}
      confirmLabel="Delete"
      onConfirm={() => {
        if (dimensionPendingDelete) {
          handleDeleteDimension(dimensionPendingDelete);
        }
      }}
      onCancel={() => setDimensionPendingDelete(null)}
    />
    <InputDialog
      open={showAddDimensionDialog}
      title="Add New Dimension"
      message="Enter a name for the new dimension:"
      placeholder="e.g. Research, Work, Ideas"
      confirmLabel="Create"
      onConfirm={handleAddDimension}
      onCancel={() => setShowAddDimensionDialog(false)}
    />
    <InputDialog
      open={showSaveViewDialog}
      title="Save View"
      message="Enter a name for this saved view:"
      placeholder="e.g. Research Tasks, Active Projects"
      confirmLabel="Save"
      onConfirm={saveCurrentView}
      onCancel={() => setShowSaveViewDialog(false)}
    />
    </>
  );
}
