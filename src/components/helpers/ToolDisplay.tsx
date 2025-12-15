"use client";

import SourceChip from './SourceChip';
import { useState } from 'react';

interface ToolDisplayProps {
  name: string;
  status: 'starting' | 'running' | 'complete' | 'error';
  context?: string;
  sources?: Array<{ url?: string; domain?: string }> | string[];
  result?: any;
  error?: string;
  onNodeClick?: (nodeId: number) => void;
}

export default function ToolDisplay({ name, status, context, sources, result, error, onNodeClick }: ToolDisplayProps) {
  const isRunning = status === 'starting' || status === 'running';
  const [expanded, setExpanded] = useState(false);
  const accentColor = '#22c55e';
  const bgTint = '#0b0b0b';
  const displayName = name;

  // Normalize sources to array of objects
  const normalizedSources: Array<{ url?: string; domain?: string }> = Array.isArray(sources)
    ? sources.map((s: any) => (typeof s === 'string' ? { domain: s } : s))
    : [];

  // Web search simple preview renderer
  const renderWebSearchPreview = () => {
    const items = result?.data?.results || result?.results || [];
    if (!Array.isArray(items) || items.length === 0) return null;
    return (
      <div style={{ marginTop: 6 }}>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{
            background: 'transparent', border: '1px solid #2a2a2a', color: '#8a8a8a',
            fontSize: 11, padding: '2px 6px', borderRadius: 4, cursor: 'pointer'
          }}
        >
          {expanded ? 'Hide results' : `Show results (${Math.min(items.length, 3)})`}
        </button>
        {expanded ? (
          <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
            {items.slice(0, 3).map((r: any, i: number) => (
              <div key={i} style={{
                background: '#0f0f0f',
                border: '1px solid #2a2a2a',
                borderRadius: 6,
                padding: '6px 8px',
                fontSize: 12,
                color: '#cfcfcf'
              }}>
                <div style={{ color: '#e5e5e5', fontWeight: 600 }}>{r.title || 'Result'}</div>
                {r.snippet ? <div style={{ color: '#9a9a9a', marginTop: 2 }}>{r.snippet}</div> : null}
                {r.url ? (
                  <div style={{ marginTop: 4 }}>
                    <a href={r.url} target="_blank" rel="noreferrer" style={{ color: '#5c9aff', fontSize: 11 }}>
                      {r.url}
                    </a>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div style={{
      margin: '8px 0',
      padding: '10px 12px',
      background: bgTint,
      border: '1px solid #2a2a2a',
      borderLeft: `2px solid ${accentColor}`,
      borderRadius: 6,
      fontSize: 12,
      color: '#cfcfcf'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        {isRunning ? (
          <span style={{
            display: 'inline-block', width: 12, height: 12,
            border: '2px solid #2a2a2a', borderTopColor: accentColor,
            borderRadius: '50%', animation: 'spin 1s linear infinite'
          }} />
        ) : (
          <span style={{ color: accentColor, fontSize: 12 }}>{status === 'error' ? '✗' : '✓'}</span>
        )}
        <span style={{ color: accentColor, fontWeight: 600 }}>{displayName}</span>
        <span style={{ marginLeft: 'auto', color: '#4a4a4a', fontSize: 11 }}>{status}</span>
      </div>
      {context ? <div style={{ color: '#9adbc2' }}>{context}</div> : null}
      {normalizedSources.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {normalizedSources.slice(0, 6).map((s, i) => (
            <SourceChip key={i} url={s.url} domain={s.domain} />
          ))}
        </div>
      ) : null}
      {/* Specific previews */}
      {name === 'webSearch' ? renderWebSearchPreview() : null}
      {name === 'websiteExtract' ? (
        <WebsiteExtractSummary result={result} onNodeClick={onNodeClick} />
      ) : null}
      {error ? (
        <div style={{ color: '#ff6b6b', marginTop: 6 }}>Error: {error}</div>
      ) : null}
    </div>
  );
}

function WebsiteExtractSummary({ result, onNodeClick }: { result?: any; onNodeClick?: (id: number) => void }) {
  const data = result?.data || {};
  const title = data.title || 'Website added';
  const url = data.url || '';
  const nodeId = data.nodeId as number | undefined;
  return (
    <div style={{ marginTop: 8, border: '1px solid #2a2a2a', background: '#0f0f0f', borderRadius: 6, padding: 8 }}>
      <div style={{ color: '#e5e5e5', fontWeight: 600 }}>{title}</div>
      {url ? (
        <div style={{ marginTop: 4, fontSize: 11 }}>
          <a href={url} target="_blank" rel="noreferrer" style={{ color: '#5c9aff' }}>
            {url}
          </a>
        </div>
      ) : null}
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        {typeof nodeId === 'number' && onNodeClick ? (
          <button
            type="button"
            onClick={() => onNodeClick(nodeId)}
            style={{
              background: 'transparent',
              border: '1px solid #2a2a2a',
              color: '#cfcfcf',
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            Open node #{nodeId}
          </button>
        ) : null}
        {typeof data.contentLength === 'number' ? (
          <span style={{ fontSize: 11, color: '#7a7a7a' }}>
            content ~{Math.round((data.contentLength as number) / 1000)}k chars
          </span>
        ) : null}
      </div>
    </div>
  );
}
