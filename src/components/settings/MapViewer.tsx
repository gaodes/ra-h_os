"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Folder, Map as MapIcon } from 'lucide-react';
import type { Edge, Node } from '@/types/database';

interface GraphNode extends Node {
  edge_count?: number;
  x: number;
  y: number;
  radius: number;
  tier: number;
}

interface PopularDimension {
  dimension: string;
  count: number;
  isPriority: boolean;
}

interface TransformState {
  x: number;
  y: number;
  scale: number;
}

const LIMIT = 400;
const PRIMARY_NODE_LIMIT = 150;

export default function MapViewer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [lockedDimensions, setLockedDimensions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transform, setTransform] = useState<TransformState>({ x: 0, y: 0, scale: 1 });
  const [hoverNode, setHoverNode] = useState<Node | null>(null);

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

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [nodesRes, edgesRes, dimensionsRes] = await Promise.all([
          fetch(`/api/nodes?limit=${LIMIT}&sortBy=edges`),
          fetch('/api/edges'),
          fetch('/api/dimensions/popular'),
        ]);

        if (!nodesRes.ok || !edgesRes.ok) {
          throw new Error('Failed to load knowledge graph data');
        }

        const nodesPayload = await nodesRes.json();
        const edgesPayload = await edgesRes.json();

        setNodes(nodesPayload.data || []);
        setEdges(edgesPayload.data || []);

        if (dimensionsRes.ok) {
          const dimPayload = await dimensionsRes.json();
          if (dimPayload.success) {
            const priority: PopularDimension[] = dimPayload.data;
            setLockedDimensions(new Set(priority.filter(d => d.isPriority).map(d => d.dimension)));
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

  const sortedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => {
      const aLocked = a.dimensions?.some(dim => lockedDimensions.has(dim));
      const bLocked = b.dimensions?.some(dim => lockedDimensions.has(dim));
      if (aLocked !== bLocked) {
        return aLocked ? -1 : 1;
      }
      return (b.edge_count ?? 0) - (a.edge_count ?? 0);
    });
  }, [nodes, lockedDimensions]);

  const contextHubIds = useMemo(() => {
    return new Set(sortedNodes.slice(0, 10).map(node => node.id));
  }, [sortedNodes]);

  const graphNodes = useMemo<GraphNode[]>(() => {
    if (sortedNodes.length === 0) return [];
    const { width, height } = containerSize;
    const centerX = width / 2;
    const centerY = height / 2;
    const primaryNodes = sortedNodes.slice(0, PRIMARY_NODE_LIMIT);
    const secondaryNodes = sortedNodes.slice(PRIMARY_NODE_LIMIT);

    const jitter = (index: number, span: number) => ((index % span) / span) * 40 - 20;

    const positionedPrimary = primaryNodes.map((node, index) => {
      const isContextHub = contextHubIds.has(node.id);
      const isLocked = node.dimensions?.some(dim => lockedDimensions.has(dim));
      const tier = isContextHub ? 0 : isLocked ? 1 : 2;
      const baseRadius = [60, 200, 340][tier];
      const radius = baseRadius + Math.min(node.edge_count || 0, 80);
      const angle = ((index % 80) / 80) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * radius + jitter(index, 5);
      const y = centerY + Math.sin(angle) * radius * 0.7 + jitter(index, 7);
      const size = tier === 0 ? 16 : tier === 1 ? 12 : 8;
      const radiusScaled = size + Math.log((node.edge_count || 1) + 1) * (tier === 2 ? 1.5 : 2.5);
      return {
        ...node,
        x,
        y,
        radius: radiusScaled,
        tier,
      };
    });

    const positionedSecondary = secondaryNodes.map((node, index) => {
      const angle = (index / secondaryNodes.length) * Math.PI * 2;
      const outerRadius = Math.max(width, height) * 0.55;
      return {
        ...node,
        x: centerX + Math.cos(angle) * outerRadius,
        y: centerY + Math.sin(angle) * outerRadius,
        radius: 2,
        tier: 3,
      };
    });

    return [...positionedPrimary, ...positionedSecondary];
  }, [sortedNodes, lockedDimensions, containerSize]);

  const graphEdges = useMemo(() => {
    if (graphNodes.length === 0 || edges.length === 0) return [];
    const nodeMap = new Map<number, GraphNode>();
    graphNodes.forEach(node => nodeMap.set(node.id, node));

    const weightedEdges = edges
      .map(edge => {
        const source = nodeMap.get(edge.from_node_id);
        const target = nodeMap.get(edge.to_node_id);
        if (!source || !target) return null;
        const weight = (source.edge_count || 0) + (target.edge_count || 0);
        return { id: edge.id, source, target, weight };
      })
      .filter(Boolean) as Array<{ id: number; source: GraphNode; target: GraphNode; weight: number }>;

    return weightedEdges
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 800);
  }, [edges, graphNodes]);

  const handleZoom = (direction: 'in' | 'out' | 'reset') => {
    if (direction === 'reset') {
      setTransform({ x: 0, y: 0, scale: 1 });
      return;
    }
    setTransform(prev => ({
      ...prev,
      scale: direction === 'in' ? Math.min(prev.scale + 0.2, 2.5) : Math.max(prev.scale - 0.2, 0.6),
    }));
  };

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

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
        Generating map...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>
        Error: {error}
      </div>
    );
  }

  if (graphNodes.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
        Not enough nodes to render a map yet
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', height: '100%', background: '#050505' }}>
      {/* Controls */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          gap: '8px',
          zIndex: 2,
        }}
      >
        <button
          onClick={() => handleZoom('in')}
          style={controlButtonStyle}
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => handleZoom('out')}
          style={controlButtonStyle}
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={() => handleZoom('reset')}
          style={controlButtonStyle}
          title="Reset view"
        >
          ⟳
        </button>
      </div>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          background: 'rgba(8,8,8,0.9)',
          border: '1px solid #1f1f1f',
          borderRadius: '8px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          fontSize: '12px',
          color: '#bbb',
          zIndex: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
          <MapIcon size={14} /> Legend
        </div>
        <LegendRow color="#fcd34d" label="Auto-context hub" />
        <LegendRow color="#7de8a5" label="Locked dimension" icon={<Folder size={12} color="#7de8a5" />} />
        <LegendRow color="#cbd5f5" label="Regular node" />
        <div style={{ fontSize: '11px', color: '#666' }}>Node size increases with edge count</div>
      </div>

      {/* Hover tooltip */}
      {hoverNode && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            maxWidth: '260px',
            background: 'rgba(10,10,10,0.95)',
            border: '1px solid #1f1f1f',
            borderRadius: '8px',
            padding: '12px',
            fontSize: '12px',
            color: '#eee',
            zIndex: 2,
          }}
        >
          <div style={{ fontWeight: 600 }}>{hoverNode.title || 'Untitled node'}</div>
          <div style={{ fontSize: '11px', color: '#666', marginBottom: '6px' }}>ID: {hoverNode.id}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span>Edges: {hoverNode.edge_count ?? 0}</span>
            <span>Auto-context hub: {contextHubIds.has(hoverNode.id) ? 'Yes' : 'No'}</span>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {(hoverNode.dimensions || []).slice(0, 3).map(dimension => (
                <span
                  key={`${hoverNode.id}-${dimension}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 6px',
                    borderRadius: '999px',
                    background: '#0f1a12',
                    border: '1px solid #1f3425',
                  }}
                >
                  <Folder size={10} />
                  {dimension}
                </span>
              ))}
            </span>
          </div>
        </div>
      )}

      <svg width="100%" height="100%" style={{ display: 'block' }}>
        <rect
          width="100%"
          height="100%"
          fill="transparent"
          style={{ cursor: 'grab' }}
          onPointerDown={handlePanStart}
        />
        <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
          {graphEdges.map(edge => {
            const thickness = Math.min(3, 0.5 + edge.weight / 300);
            const opacity = Math.min(0.7, 0.2 + edge.weight / 800);
            return (
              <line
                key={edge.id}
                x1={edge.source.x}
                y1={edge.source.y}
                x2={edge.target.x}
                y2={edge.target.y}
                stroke="#1f2933"
                strokeWidth={thickness}
                strokeOpacity={opacity}
              />
            );
          })}
      {graphNodes.map(node => {
        const isContextHub = contextHubIds.has(node.id);
        const isLocked = node.dimensions?.some(dim => lockedDimensions.has(dim));
        const fill = isContextHub ? '#fcd34d' : isLocked ? '#7de8a5' : node.tier === 3 ? '#334155' : '#cbd5f5';
        const stroke = isContextHub ? '#fbbf24' : isLocked ? '#4ade80' : node.tier === 3 ? '#1e293b' : '#94a3b8';
        const showLabel = node.tier < 3 && transform.scale > 0.8;
        return (
          <g
            key={node.id}
            onMouseEnter={() => setHoverNode(node)}
            onMouseLeave={() => setHoverNode(null)}
            onClick={() => {
              if (node.tier === 3) return;
              setTransform(prev => {
                const nextScale = Math.min(2.5, Math.max(prev.scale, 1.4));
                return {
                  scale: nextScale,
                  x: containerSize.width / 2 - node.x * nextScale,
                  y: containerSize.height / 2 - node.y * nextScale,
                };
              });
            }}
            style={{ cursor: node.tier < 3 ? 'pointer' : 'default' }}
          >
            <circle
              cx={node.x}
              cy={node.y}
              r={node.radius}
              fill={fill}
              fillOpacity={node.tier === 3 ? 0.4 : isContextHub ? 0.95 : 0.75}
              stroke={stroke}
              strokeWidth={node.tier === 3 ? 0.5 : isContextHub ? 2.5 : 1.5}
              opacity={node.tier === 3 ? 0.6 : 0.95}
            />
            {showLabel && (
              <text
                x={node.x}
                y={node.y + node.radius + 12}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize={10}
                fontWeight={500}
              >
                {(node.title || 'Untitled').slice(0, 24)}
              </text>
            )}
          </g>
        );
      })}
        </g>
      </svg>
    </div>
  );
}

function LegendRow({ color, label, icon }: { color: string; label: string; icon?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span
        style={{
          width: '12px',
          height: '12px',
          borderRadius: '999px',
          background: color,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#000',
          fontSize: '9px',
        }}
      >
        {icon}
      </span>
      {label}
    </div>
  );
}

const controlButtonStyle: CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '999px',
  border: '1px solid #1f1f1f',
  background: 'rgba(8,8,8,0.85)',
  color: '#eee',
  fontSize: '16px',
  cursor: 'pointer',
};
