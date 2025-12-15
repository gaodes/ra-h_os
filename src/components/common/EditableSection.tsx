"use client";

import { ReactNode, CSSProperties } from 'react';

interface EditableSectionProps {
  label: string;
  summary: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  metadata?: string;
  disabled?: boolean;
}

export default function EditableSection({
  label,
  summary,
  expanded,
  onToggle,
  children,
  metadata,
  disabled = false
}: EditableSectionProps) {
  return (
    <div style={{
      marginBottom: '12px',
      background: '#1a1a1a',
      border: '1px solid #2a2a2a',
      borderRadius: '4px',
      overflow: 'visible'
    }}>
      <div
        onClick={disabled ? undefined : onToggle}
        style={{
          padding: '8px 12px',
          cursor: disabled ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'background 0.2s',
          background: expanded ? '#202020' : 'transparent'
        }}
        onMouseEnter={(e) => {
          if (!disabled && !expanded) {
            e.currentTarget.style.background = '#1f1f1f';
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && !expanded) {
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        <span style={{
          fontSize: '10px',
          fontWeight: 600,
          color: '#5c9aff',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          minWidth: '40px'
        }}>
          {label}
        </span>
        
        <div style={{
          flex: 1,
          fontSize: '11px',
          color: '#888',
          lineHeight: '1.4',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {summary}
        </div>
        
        {metadata && (
          <span style={{
            fontSize: '10px',
            color: '#555',
            flexShrink: 0
          }}>
            {metadata}
          </span>
        )}
        
        {!disabled && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            style={{
              color: '#555',
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s'
            }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
        
        {disabled && (
          <span style={{
            fontSize: '9px',
            color: '#555',
            background: '#252525',
            padding: '2px 4px',
            borderRadius: '2px'
          }}>
            locked
          </span>
        )}
      </div>
      
      {expanded && (
        <div style={{
          padding: '12px',
          borderTop: '1px solid #2a2a2a',
          background: '#161616',
          position: 'relative'
        }}>
          {children}
        </div>
      )}
    </div>
  );
}