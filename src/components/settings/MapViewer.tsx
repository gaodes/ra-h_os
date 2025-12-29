"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Edge, Node } from '@/types/database';

interface GraphNode extends Node {
  edge_count?: number;
  x: number;
  y: number;
  radius: number;
}

interface LockedDimension {
  name: string;
}

const NODE_LIMIT = 200;
const LABEL_THRESHOLD = 15; // Top N nodes get labels

export default function MapViewer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [lockedDimensions, setLockedDimensions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });

  // Resize observer
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry?.contentRect) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [nodesRes, edgesRes, dimsRes] = await Promise.all([
          fetch(`/api/nodes?limit=${NODE_LIMIT}&sortBy=edges`),
          fetch('/api/edges'),
          fetch('/api/dimensions'),
        ]);

        if (!nodesRes.ok || !edgesRes.ok) {
          throw new Error('Failed to load data');
        }

        const nodesPayload = await nodesRes.json();
        const edgesPayload = await edgesRes.json();

        setNodes(nodesPayload.data || []);
        setEdges(edgesPayload.data || []);

        // Get locked dimensions
        if (dimsRes.ok) {
          const dimsPayload = await dimsRes.json();
          if (dimsPayload.success && dimsPayload.data) {
            const locked = (dimsPayload.data as LockedDimension[])
              .filter((d: LockedDimension & { is_locked?: boolean }) => d.is_locked)
              .map((d: LockedDimension) => d.name);
            setLockedDimensions(new Set(locked));
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Position nodes in a cluster layout
  const graphNodes = useMemo<GraphNode[]>(() => {
    if (nodes.length === 0) return [];

    const { width, height } = containerSize;
    const centerX = width / 2;
    const centerY = height / 2;

    // Sort by edge count (highest first)
    const sorted = [...nodes].sort((a, b) => (b.edge_count ?? 0) - (a.edge_count ?? 0));

    // Find max edge count for scaling
    const maxEdges = Math.max(...sorted.map(n => n.edge_count ?? 0), 1);

    // Position nodes using a spiral/cluster approach
    // High-edge nodes get placed more centrally with more space
    return sorted.map((node, index) => {
      const edgeCount = node.edge_count ?? 0;
      const edgeRatio = edgeCount / maxEdges;

      // Radius from center - higher edge count = closer to center
      // Use golden angle for nice distribution
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const angle = index * goldenAngle;

      // Distance from center inversely proportional to edge count
      // Top nodes cluster in center, others spread out
      // Extra spacing for labeled nodes (top 15) to prevent label overlap
      const isLabeled = index < LABEL_THRESHOLD;
      const labelSpacing = isLabeled ? 60 : 0;
      const baseDistance = 80 + labelSpacing + (1 - edgeRatio) * Math.min(width, height) * 0.35;
      const distance = baseDistance + (index * 4); // More spread between nodes

      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;

      // Node size based on edge count
      // Min 3px for tiny dots, max ~20px for top nodes
      const minRadius = 3;
      const maxRadius = 18;
      const radius = minRadius + edgeRatio * (maxRadius - minRadius);

      return {
        ...node,
        x,
        y,
        radius,
      };
    });
  }, [nodes, containerSize]);

  // Get edges between visible nodes
  const graphEdges = useMemo(() => {
    if (graphNodes.length === 0 || edges.length === 0) return [];

    const nodeMap = new Map<number, GraphNode>();
    graphNodes.forEach(node => nodeMap.set(node.id, node));

    return edges
      .map(edge => {
        const source = nodeMap.get(edge.from_node_id);
        const target = nodeMap.get(edge.to_node_id);
        if (!source || !target) return null;
        return { id: edge.id, source, target };
      })
      .filter(Boolean) as Array<{ id: number; source: GraphNode; target: GraphNode }>;
  }, [edges, graphNodes]);

  // Get connected node IDs for selected node
  const connectedNodeIds = useMemo(() => {
    if (!selectedNode) return new Set<number>();
    const connected = new Set<number>();
    edges.forEach(edge => {
      if (edge.from_node_id === selectedNode.id) connected.add(edge.to_node_id);
      if (edge.to_node_id === selectedNode.id) connected.add(edge.from_node_id);
    });
    return connected;
  }, [selectedNode, edges]);

  // Pan handling
  const handlePanStart = (event: React.PointerEvent<SVGRectElement>) => {
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = transform.x;
    const originY = transform.y;

    const handleMove = (moveEvent: PointerEvent) => {
      setTransform(prev => ({
        ...prev,
        x: originX + (moveEvent.clientX - startX),
        y: originY + (moveEvent.clientY - startY),
      }));
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const handleZoom = (direction: 'in' | 'out' | 'reset') => {
    if (direction === 'reset') {
      setTransform({ x: 0, y: 0, scale: 1 });
      return;
    }
    setTransform(prev => ({
      ...prev,
      scale: direction === 'in'
        ? Math.min(prev.scale + 0.2, 3)
        : Math.max(prev.scale - 0.2, 0.5),
    }));
  };

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
        Loading map...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
        {error}
      </div>
    );
  }

  if (graphNodes.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
        No nodes to display
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', height: '100%', background: '#080808' }}>
      {/* Zoom controls */}
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 10 }}>
        <button onClick={() => handleZoom('in')} style={controlBtn} title="Zoom in">+</button>
        <button onClick={() => handleZoom('out')} style={controlBtn} title="Zoom out">−</button>
        <button onClick={() => handleZoom('reset')} style={controlBtn} title="Reset">⟳</button>
      </div>

      {/* Selected node info */}
      {selectedNode && (
        <div style={infoPanel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {selectedNode.title || 'Untitled'}
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16 }}
            >
              ×
            </button>
          </div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
            {connectedNodeIds.size} connected nodes · {selectedNode.edge_count ?? 0} total edges
          </div>
          <div style={{ fontSize: 11, color: '#22c55e', marginBottom: 8 }}>
            Click a highlighted node to explore
          </div>
          {selectedNode.dimensions && selectedNode.dimensions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {selectedNode.dimensions.slice(0, 5).map(dim => (
                <span
                  key={dim}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 11,
                    background: lockedDimensions.has(dim) ? '#132018' : '#1a1a1a',
                    color: lockedDimensions.has(dim) ? '#86efac' : '#888',
                  }}
                >
                  {dim}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SVG Graph */}
      <svg width="100%" height="100%" style={{ display: 'block' }}>
        <defs />
        <rect
          width="100%"
          height="100%"
          fill="transparent"
          style={{ cursor: 'grab' }}
          onPointerDown={handlePanStart}
        />
        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
          {/* Edges */}
          {graphEdges.map(edge => {
            const isConnected = selectedNode && (
              edge.source.id === selectedNode.id || edge.target.id === selectedNode.id
            );
            return (
              <line
                key={edge.id}
                x1={edge.source.x}
                y1={edge.source.y}
                x2={edge.target.x}
                y2={edge.target.y}
                stroke={isConnected ? '#22c55e' : '#374151'}
                strokeWidth={isConnected ? 1.5 : 0.75}
                strokeOpacity={selectedNode ? (isConnected ? 0.9 : 0.15) : 0.6}
              />
            );
          })}

          {/* Nodes */}
          {graphNodes.map((node, index) => {
            const isTop = index < LABEL_THRESHOLD;
            const isSelected = selectedNode?.id === node.id;
            const isConnectedToSelected = connectedNodeIds.has(node.id);
            const isDimmed = selectedNode && !isSelected && !isConnectedToSelected;

            return (
              <g
                key={node.id}
                onClick={() => setSelectedNode(isSelected ? null : node)}
                style={{ cursor: 'pointer' }}
                opacity={isDimmed ? 0.25 : 1}
              >
                {/* Highlight ring for connected nodes */}
                {isConnectedToSelected && !isSelected && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.radius + 4}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth={2}
                    strokeOpacity={0.6}
                  />
                )}
                {/* Node circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.radius}
                  fill={isTop ? '#22c55e' : '#334155'}
                  fillOpacity={isTop ? 0.6 : 0.4}
                  stroke={isSelected ? '#fff' : isTop ? '#166534' : '#1e293b'}
                  strokeWidth={isSelected ? 2 : isTop ? 1.5 : 0.5}
                />

                {/* Label for top nodes */}
                {isTop && (
                  <>
                    {/* Title */}
                    <text
                      x={node.x}
                      y={node.y + node.radius + 14}
                      textAnchor="middle"
                      fill="#e5e7eb"
                      fontSize={11}
                      fontWeight={500}
                    >
                      {(node.title || 'Untitled').slice(0, 20)}
                      {(node.title?.length ?? 0) > 20 ? '…' : ''}
                    </text>

                    {/* Top dimensions (max 3) */}
                    {node.dimensions && node.dimensions.length > 0 && (() => {
                      const dims = node.dimensions.slice(0, 3).map(d => d.length > 10 ? d.slice(0, 9) + '…' : d).join('  ·  ');
                      const labelWidth = dims.length * 5 + 16;
                      return (
                        <g>
                          <rect
                            x={node.x - labelWidth / 2}
                            y={node.y + node.radius + 18}
                            width={labelWidth}
                            height={16}
                            rx={8}
                            fill="#141414"
                            stroke="#262626"
                            strokeWidth={0.5}
                          />
                          <text
                            x={node.x}
                            y={node.y + node.radius + 29}
                            textAnchor="middle"
                            fill="#a1a1aa"
                            fontSize={9}
                          >
                            {dims}
                          </text>
                        </g>
                      );
                    })()}
                  </>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

const controlBtn: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 6,
  border: '1px solid #262626',
  background: '#141414',
  color: '#888',
  fontSize: 16,
  cursor: 'pointer',
};

const infoPanel: CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: 16,
  width: 260,
  background: '#0a0a0a',
  border: '1px solid #1f1f1f',
  borderRadius: 8,
  padding: 14,
  zIndex: 10,
};
