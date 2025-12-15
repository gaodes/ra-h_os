"use client";

import { useState } from 'react';

interface ReasoningTraceProps {
  trace?: {
    purpose?: string;
    thoughts?: string;
    next_action?: string;
    step?: number;
    done?: boolean;
    timestamp?: string;
  } | null;
  collapsible?: boolean;
}

export default function ReasoningTrace({ trace, collapsible = true }: ReasoningTraceProps) {
  const [expanded, setExpanded] = useState(false);
  if (!trace) return null;
  const short = (s?: string, n = 180) => (s || '').slice(0, n) + ((s || '').length > n ? '…' : '');
  return (
    <div style={{
      margin: '6px 0', padding: '8px 10px',
      background: '#0e0e12', border: '1px solid #2a2a2a',
      borderLeft: '2px solid #6b6b7f', borderRadius: 6,
      fontSize: 12, color: '#cfcfcf', lineHeight: 1.5
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ color: '#8b8b9f', fontWeight: 600 }}>Reasoning trace</span>
        {trace.timestamp ? (
          <span style={{ color: '#4a4a4a', fontSize: 11 }}>{new Date(trace.timestamp).toLocaleTimeString()}</span>
        ) : null}
        <span style={{ marginLeft: 'auto', color: '#4a4a4a', fontSize: 11 }}>{trace.done ? 'final' : 'in-progress'}</span>
      </div>
      {/* Collapsed: show only the purpose as the title */}
      {trace.purpose ? (
        <div style={{ color: '#9adbc2' }}>Goal: {expanded ? trace.purpose : short(trace.purpose, 80)}</div>
      ) : null}
      {/* Expanded: show details */}
      {expanded && trace.thoughts ? <div style={{ marginTop: 6 }}>{trace.thoughts}</div> : null}
      {expanded && trace.next_action ? (
        <div style={{ marginTop: 6, color: '#a5b4fc' }}>Next: {trace.next_action}</div>
      ) : null}
      {collapsible ? (
        <div style={{ marginTop: 6 }}>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            style={{
              background: 'transparent', border: '1px solid #2a2a2a', color: '#8a8a8a',
              fontSize: 11, padding: '2px 6px', borderRadius: 4, cursor: 'pointer'
            }}
          >
            {expanded ? 'Hide reasoning' : 'Show full reasoning'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
