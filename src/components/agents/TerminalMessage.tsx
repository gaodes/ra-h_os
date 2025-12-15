"use client";

import { useMemo } from 'react';
import { parseAndRenderContent } from '@/components/helpers/NodeLabelRenderer';
import ToolDisplay from '@/components/helpers/ToolDisplay';
import MarkdownRenderer from '@/components/helpers/MarkdownRenderer';
import ReasoningTrace from '@/components/helpers/ReasoningTrace';
import { extractToolContext, extractSources } from '@/utils/toolFormatting';

interface TerminalMessageProps {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'thinking';
  content: string;
  timestamp: Date;
  toolName?: string;
  status?: 'sending' | 'delivered' | 'error' | 'processing' | 'starting' | 'running' | 'complete';
  toolArgs?: any;
  toolResult?: any;
  onNodeClick?: (nodeId: number) => void;
}

// no local state needed

export default function TerminalMessage({ 
  role, 
  content, 
  timestamp, 
  toolName,
  status = 'delivered',
  toolArgs,
  toolResult,
  onNodeClick
}: TerminalMessageProps) {
  
  const dotColor = useMemo(() => {
    const colors = {
      user: '#5c9aff',
      assistant: '#52d97a',
      tool: '#ffcc66',
      thinking: '#b794f6',
      system: '#69d2e7'
    };
    return colors[role] || colors.assistant;
  }, [role]);

  const isAnimated = role === 'thinking' || status === 'processing';
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    }).toLowerCase();
  };

  // Handle tool messages specially
  if (role === 'tool') {
    // THINK tool: display structured trace when present in toolResult
    if (toolName === 'think') {
      const trace = toolResult?.data?.trace || null;
      return <ReasoningTrace trace={trace} collapsible />;
    }

    // Generic tool display with context and sources
    const context =
      extractToolContext(toolName, toolArgs) ||
      (toolName === 'webSearch' && toolResult?.data?.query ? `Searching for: ${String(toolResult.data.query)}` : undefined);
    const sources = extractSources(toolName, toolResult);
    const normalizedStatus =
      status === 'processing' ? 'running' : status === 'delivered' ? 'complete' : ((status as any) || 'complete');
    return (
      <ToolDisplay
        name={toolName || 'tool'}
        status={normalizedStatus}
        context={context}
        sources={sources}
        result={toolResult}
        onNodeClick={onNodeClick}
      />
    );
  }

  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      padding: '8px 0',
      fontFamily: 'inherit'
    }}>
      {/* Status Dot */}
      <span
        style={{
          flexShrink: 0,
          width: '6px',
          height: '6px',
          marginTop: '7px',
          borderRadius: '50%',
          background: dotColor,
          transition: 'all 150ms ease',
          ...(isAnimated && {
            animation: 'pulse 1.5s infinite'
          })
        }}
      />
      
      {/* Message Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {content ? (
          <MarkdownRenderer content={content} streaming={status === 'processing'} onNodeClick={onNodeClick} />
        ) : (
          role === 'thinking' ? <span>Thinking...</span> : null
        )}
        {/* References block for assistant messages: extract [Title](URL) */}
        {role === 'assistant' && typeof content === 'string' && (() => {
          const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
          const refs: Array<{ title: string; url: string }> = [];
          let m: RegExpExecArray | null;
          while ((m = linkRegex.exec(content)) !== null) {
            refs.push({ title: m[1], url: m[2] });
            if (refs.length >= 12) break;
          }
          if (refs.length === 0) return null;
          return (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: '#8a8a8a', fontSize: 11, marginBottom: 4 }}>References</div>
              <div style={{ display: 'grid', gap: 4 }}>
                {refs.map((r, i) => (
                  <div key={i} style={{ color: '#bdbdbd', fontSize: 12 }}>
                    {i + 1}. <span style={{ color: '#e5e5e5' }}>{r.title}</span> — <a href={r.url} target="_blank" rel="noreferrer" style={{ color: '#5c9aff' }}>{r.url}</a>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        
        {/* Timestamp */}
      <span style={{
        display: 'inline-block',
        marginTop: '4px',
        color: '#4a4a4a',
        fontSize: '11px'
      }}>
        {formatTime(timestamp)}
      </span>
      </div>
    </div>
  );
}
