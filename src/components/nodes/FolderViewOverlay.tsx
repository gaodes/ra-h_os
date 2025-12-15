"use client";

import { useEffect, useMemo, useState, useRef, type DragEvent } from 'react';
import { Folder, Check, X, ArrowLeft, Plus, Trash2, Edit2 } from 'lucide-react';
import type { Node } from '@/types/database';
import ConfirmDialog from '../common/ConfirmDialog';
import InputDialog from '../common/InputDialog';
import { getNodeIcon } from '@/utils/nodeIcons';

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
    if (event.dataTransfer.types.includes('application/node-info')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDimensionDragEnter = (event: DragEvent<HTMLElement>, dimension: string) => {
    if (event.dataTransfer.types.includes('application/node-info')) {
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
      const raw = event.dataTransfer.getData('application/node-info');
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
          padding: '24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          maxWidth: '100%'
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
              background: dragHoverDimension === dimension.dimension ? '#152214' : (dimension.isPriority ? '#0a0e0b' : '#0a0a0a'),
              border: dimension.isPriority ? '1px solid #1c3f28' : '1px solid #161616',
              borderRadius: '16px',
              padding: '20px',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              position: 'relative',
              boxShadow: dimension.isPriority 
                ? '0 0 0 1px rgba(125, 232, 165, 0.1), 0 2px 8px rgba(0, 0, 0, 0.3)' 
                : '0 1px 4px rgba(0, 0, 0, 0.2)'
            }}
              onMouseEnter={(e) => {
                if (dragHoverDimension !== dimension.dimension) {
                  e.currentTarget.style.background = dimension.isPriority ? '#0f140f' : '#111111';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = dimension.isPriority 
                    ? '0 0 0 1px rgba(125, 232, 165, 0.2), 0 8px 25px rgba(0, 0, 0, 0.4)' 
                    : '0 4px 12px rgba(0, 0, 0, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (dragHoverDimension !== dimension.dimension) {
                  e.currentTarget.style.background = dimension.isPriority ? '#0a0e0b' : '#0a0a0a';
                  e.currentTarget.style.transform = 'translateY(0px)';
                  e.currentTarget.style.boxShadow = dimension.isPriority 
                    ? '0 0 0 1px rgba(125, 232, 165, 0.1), 0 2px 8px rgba(0, 0, 0, 0.3)' 
                    : '0 1px 4px rgba(0, 0, 0, 0.2)';
                }
              }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: dimension.isPriority ? '#7de8a5' : '#cbd5f5' }}>
                <Folder size={18} />
                <span style={{ 
                  fontSize: '11px', 
                  fontWeight: 600,
                  color: dimension.isPriority ? '#7de8a5' : '#64748b',
                  background: dimension.isPriority ? 'rgba(125, 232, 165, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                  padding: '2px 6px',
                  borderRadius: '8px',
                  minWidth: '20px',
                  textAlign: 'center'
                }}>
                  {dimension.count}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleLock(dimension.dimension);
                  }}
                  title={dimension.isPriority ? 'Click to unlock this dimension' : 'Click to lock this dimension'}
                  style={{
                    background: dimension.isPriority ? 'rgba(125, 232, 165, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                    border: dimension.isPriority ? '1px solid rgba(125, 232, 165, 0.3)' : '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '8px',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: dimension.isPriority ? '#7de8a5' : '#94a3b8',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Check size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDimensionPendingDelete(dimension.dimension);
                  }}
                  title="Delete this dimension"
                  style={{
                    background: 'rgba(248, 113, 113, 0.1)',
                    border: '1px solid rgba(248, 113, 113, 0.2)',
                    borderRadius: '8px',
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: deletingDimension === dimension.dimension ? 'not-allowed' : 'pointer',
                    color: '#f87171',
                    opacity: deletingDimension === dimension.dimension ? 0.4 : 1,
                    transition: 'all 0.2s ease'
                  }}
                  disabled={deletingDimension === dimension.dimension}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
            
            {/* Dimension name */}
            <div style={{ 
              fontSize: '14px', 
              fontWeight: 700, 
              color: '#f8fafc', 
              whiteSpace: 'nowrap', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis', 
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '2px'
            }}>
              {dimension.dimension}
            </div>
            
            {/* Description preview (read-only) */}
            {dimension.description ? (
              <div style={{ 
                fontSize: '11px', 
                color: '#94a3b8',
                lineHeight: '1.5',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                wordBreak: 'break-word',
                fontWeight: 400
              }}>
                {dimension.description}
              </div>
            ) : (
              <div style={{ 
                fontSize: '11px', 
                color: '#4b5563',
                lineHeight: '1.5',
                fontStyle: 'italic',
                fontWeight: 300
              }}>
                No description
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderNodeGrid = () => {
    if (!selectedDimension) return null;

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '0 24px 12px', color: '#94a3b8', fontSize: '12px', fontWeight: 500 }}>
          Showing <strong style={{ color: '#f8fafc' }}>{nodes.length}</strong> nodes tagged with <strong style={{ color: '#7de8a5' }}>{selectedDimension.dimension.toUpperCase()}</strong>
        </div>
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
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {view === 'dimensions' ? (
                'Dimensions'
              ) : editingDimensionName ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Nodes –</span>
                  <input
                    type="text"
                    value={editDimensionNameText}
                    onChange={(e) => setEditDimensionNameText(e.target.value)}
                    autoFocus
                    style={{
                      padding: '4px 8px',
                      fontSize: '13px',
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      background: '#1a1a1a',
                      border: '1px solid #333',
                      borderRadius: '4px',
                      color: '#f8fafc',
                      outline: 'none',
                      minWidth: '120px'
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveDimensionName();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        handleCancelDimensionName();
                      }
                    }}
                  />
                  <button
                    onClick={handleSaveDimensionName}
                    style={{
                      padding: '4px',
                      borderRadius: '4px',
                      border: '1px solid #22c55e',
                      background: 'transparent',
                      color: '#22c55e',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <Check size={12} />
                  </button>
                  <button
                    onClick={handleCancelDimensionName}
                    style={{
                      padding: '4px',
                      borderRadius: '4px',
                      border: '1px solid #64748b',
                      background: 'transparent',
                      color: '#64748b',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Nodes –</span>
                  <span 
                    onClick={handleEditDimensionName}
                    style={{
                      cursor: 'pointer',
                      padding: '2px 4px',
                      borderRadius: '4px',
                      border: '1px dashed transparent',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#333';
                      e.currentTarget.style.background = '#1a1a1a';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {selectedDimension?.dimension ?? ''}
                    <Edit2 size={10} style={{ opacity: 0.6 }} />
                  </span>
                </div>
              )}
            </div>
            {view === 'nodes' && selectedDimension && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                {editingDescription ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                    <input
                      type="text"
                      value={editDescriptionText}
                      onChange={(e) => setEditDescriptionText(e.target.value)}
                      placeholder="Add a description to help with auto-assignment..."
                      autoFocus
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        fontSize: '12px',
                        background: '#0f0f0f',
                        border: '1px solid #22c55e',
                        borderRadius: '8px',
                        color: '#f8fafc',
                        outline: 'none',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveDescription();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          handleCancelDescription();
                        }
                      }}
                    />
                    <button
                      onClick={handleSaveDescription}
                      style={{
                        padding: '8px',
                        borderRadius: '8px',
                        border: '1px solid #22c55e',
                        background: 'rgba(34, 197, 94, 0.1)',
                        color: '#22c55e',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={handleCancelDescription}
                      style={{
                        padding: '8px',
                        borderRadius: '8px',
                        border: '1px solid #64748b',
                        background: 'rgba(100, 116, 139, 0.1)',
                        color: '#64748b',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div 
                    onClick={handleEditDescription}
                    style={{
                      fontSize: '12px',
                      color: selectedDimension.description ? '#94a3b8' : '#64748b',
                      fontStyle: selectedDimension.description ? 'normal' : 'italic',
                      cursor: 'pointer',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px dashed transparent',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      minHeight: '32px',
                      flex: 1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#333';
                      e.currentTarget.style.background = '#0f0f0f';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <Edit2 size={12} style={{ opacity: 0.6 }} />
                    <span style={{ 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {selectedDimension.description || 'Add description...'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {view === 'dimensions' && (
            <button
              onClick={() => setShowAddDimensionDialog(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 16px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#22c55e',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                borderBottom: '1px solid #1a1a1a',
                background: '#0a0a0a',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#151515';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#0a0a0a';
              }}
            >
              <span style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: '#22c55e',
                color: '#0a0a0a',
                fontSize: '16px',
                lineHeight: 1,
                fontWeight: 300
              }}>+</span>
              Add Dimension
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: '1px solid #1f1f1f',
              background: 'transparent',
              cursor: 'pointer',
              color: '#cbd5f5'
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>
      {view === 'dimensions' ? renderDimensionGrid() : renderNodeGrid()}
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
    </>
  );
}
