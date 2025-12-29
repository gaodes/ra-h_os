"use client";

import { useState, useEffect, type CSSProperties } from 'react';

interface WorkflowDefinition {
  id: number;
  key: string;
  displayName: string;
  description: string;
  instructions: string;
  enabled: boolean;
  requiresFocusedNode: boolean;
  primaryActor: 'oracle' | 'main';
  expectedOutcome?: string;
}

export default function WorkflowsViewer() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/workflows');
        const result = await res.json();
        if (result.success) setWorkflows(result.data);
      } catch (e) {
        console.error('Failed to load workflows:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return <div style={loadingStyle}>Loading...</div>;
  }

  return (
    <div style={containerStyle}>
      <p style={descStyle}>Available workflows. Click to view instructions.</p>

      {workflows.length === 0 ? (
        <div style={emptyStyle}>No workflows defined.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {workflows.map((w) => {
            const expanded = expandedId === w.id;
            return (
              <div key={w.id} style={cardStyle}>
                <div
                  onClick={() => setExpandedId(expanded ? null : w.id)}
                  style={cardHeaderStyle}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={titleStyle}>{w.displayName}</span>
                    <span style={keyStyle}>{w.key}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontSize: 11,
                      color: w.enabled ? '#22c55e' : '#6b7280',
                    }}>
                      {w.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <span style={{
                      fontSize: 12,
                      color: '#6b7280',
                      transform: expanded ? 'rotate(180deg)' : 'rotate(0)',
                      transition: 'transform 0.15s',
                    }}>
                      ▼
                    </span>
                  </div>
                </div>
                <div style={descRowStyle}>{w.description}</div>
                {expanded && (
                  <div style={expandedStyle}>
                    <div style={instructionsStyle}>{w.instructions}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const containerStyle: CSSProperties = { padding: 24, height: '100%', overflow: 'auto' };
const loadingStyle: CSSProperties = { padding: 24, color: '#6b7280' };
const descStyle: CSSProperties = { fontSize: 13, color: '#6b7280', marginBottom: 20 };
const emptyStyle: CSSProperties = { fontSize: 13, color: '#6b7280', textAlign: 'center', padding: 32 };

const cardStyle: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: 8,
  overflow: 'hidden',
};

const cardHeaderStyle: CSSProperties = {
  padding: '14px 16px',
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const titleStyle: CSSProperties = { fontSize: 13, fontWeight: 500, color: '#e5e7eb' };
const keyStyle: CSSProperties = { fontSize: 11, fontFamily: 'monospace', color: '#6b7280' };
const descRowStyle: CSSProperties = { fontSize: 12, color: '#9ca3af', padding: '0 16px 14px', lineHeight: 1.5 };

const expandedStyle: CSSProperties = {
  padding: 16,
  borderTop: '1px solid rgba(255, 255, 255, 0.04)',
  background: 'rgba(0, 0, 0, 0.2)',
};

const instructionsStyle: CSSProperties = {
  fontSize: 12,
  fontFamily: 'monospace',
  color: '#d1d5db',
  whiteSpace: 'pre-wrap',
  lineHeight: 1.6,
  padding: 12,
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: 6,
  maxHeight: 300,
  overflow: 'auto',
};
