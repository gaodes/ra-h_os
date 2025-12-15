"use client";

import { ReactNode, CSSProperties } from 'react';

interface PanelHeaderProps {
  title: string;
  leftContent?: ReactNode;
  rightContent?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export default function PanelHeader({ 
  title, 
  leftContent, 
  rightContent,
  className = '',
  style = {}
}: PanelHeaderProps) {
  return (
    <div 
      className={`panel-header ${className}`}
      style={{
        height: '48px',
        padding: '0 12px',
        borderBottom: '1px solid rgba(42, 42, 42, 0.8)',
        background: '#0f0f0f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        ...style
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flex: 1,
        minWidth: 0
      }}>
        <span style={{
          textTransform: 'uppercase',
          fontSize: '12px',
          fontWeight: 500,
          color: '#888',
          letterSpacing: '0.05em',
          flexShrink: 0
        }}>
          {title}
        </span>
        {leftContent}
      </div>
      
      {rightContent && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0
        }}>
          {rightContent}
        </div>
      )}
    </div>
  );
}