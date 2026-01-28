"use client";

import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { RahNodeData } from './utils';
import { LABEL_THRESHOLD } from './utils';

type RahNodeType = Node<RahNodeData, 'rahNode'>;

function RahNodeComponent({ data, selected }: NodeProps<RahNodeType>) {
  const { label, dimensions, edgeCount, isExpanded } = data;
  const isTop = !isExpanded && edgeCount > 3;

  return (
    <div
      className={[
        'rah-map-node',
        isExpanded && 'rah-map-node--expanded',
        isTop && 'rah-map-node--top',
        selected && 'rah-map-node--selected',
      ].filter(Boolean).join(' ')}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="rah-map-handle"
      />
      <div className="rah-map-node__title">
        {label.length > 28 ? label.slice(0, 26) + '\u2026' : label}
      </div>
      {(isTop || isExpanded) && dimensions.length > 0 && (
        <div className="rah-map-node__dims">
          {dimensions.slice(0, 3).map(d => d.length > 12 ? d.slice(0, 11) + '\u2026' : d).join(' \u00b7 ')}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="rah-map-handle"
      />
    </div>
  );
}

export const RahNode = memo(RahNodeComponent);
