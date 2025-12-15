import { ReactNode } from 'react';
import type { AgentDelegation } from '@/services/agents/delegation';

interface MiniRAHPanelProps {
  delegation: AgentDelegation;
  onNodeClick?: (nodeId: number) => void;
}

const statusPalette: Record<string, { border: string; badge: string }> = {
  queued: { border: '#1f3a5f', badge: '#5c9aff' },
  in_progress: { border: '#3b5f2a', badge: '#8bd450' },
  completed: { border: '#2a2a2a', badge: '#6b6b6b' },
  failed: { border: '#5f2a2a', badge: '#ff6b6b' },
};

const NODE_LINK_REGEX = /\[NODE:(\d+):"([^"]+)"\]/g;

function formatStatus(status: string) {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'in_progress':
      return 'Working';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

function renderNodeAwareLine(text: string, onNodeClick?: (nodeId: number) => void): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  text.replace(NODE_LINK_REGEX, (match, id, title, offset) => {
    if (offset > lastIndex) {
      parts.push(<span key={`mini-text-${offset}`}>{text.slice(lastIndex, offset)}</span>);
    }

    const nodeId = Number(id);
    const handleClick = () => {
      if (onNodeClick) onNodeClick(nodeId);
    };

    parts.push(
      <button
        key={`mini-node-${offset}`}
        type="button"
        className="node-pill"
        onClick={handleClick}
      >
        <span className="node-pill-id">NODE:{nodeId}</span>
        <span className="node-pill-title">{title}</span>
      </button>
    );

    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < text.length) {
    parts.push(<span key="mini-text-end">{text.slice(lastIndex)}</span>);
  }

  return <>{parts}</>;
}

export default function MiniRAHPanel({ delegation, onNodeClick }: MiniRAHPanelProps) {
  const palette = statusPalette[delegation.status] ?? statusPalette.queued;
  const summaryLines = delegation.summary ? delegation.summary.split('\n').filter(Boolean) : [];

  return (
    <div className="mini-panel">
      <header className="mini-header" style={{ borderBottomColor: palette.border }}>
        <span className="status-dot" style={{ background: palette.badge }} />
        <span className="header-title">MINI RA-H</span>
        <span className="header-status">· {formatStatus(delegation.status)}</span>
        <span className="header-time">{new Date(delegation.updatedAt).toLocaleTimeString()}</span>
      </header>

      <section className="section">
        <h3>Task</h3>
        <p>{delegation.task}</p>
      </section>

      {delegation.context.length > 0 && (
        <section className="section">
          <h3>Context</h3>
          <ul className="context-list">
            {delegation.context.map((item, idx) => (
              <li key={idx}>{renderNodeAwareLine(item, onNodeClick)}</li>
            ))}
          </ul>
        </section>
      )}

      {summaryLines.length > 0 && (
        <section className="section">
          <h3>Summary</h3>
          <div className="summary-card">
            {summaryLines.map((line, idx) => (
              <p key={idx}>{renderNodeAwareLine(line, onNodeClick)}</p>
            ))}
          </div>
        </section>
      )}

      <style jsx>{`
        .mini-panel {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 24px;
          background: #0a0a0a;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          height: 100%;
          overflow-y: auto;
        }

        .mini-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(91, 154, 255, 0.25);
        }

        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .header-title {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.12em;
          color: #84c8ff;
        }

        .header-status {
          font-size: 12px;
          color: #7da0b6;
        }

        .header-time {
          margin-left: auto;
          font-size: 11px;
          color: #5f5f5f;
        }

        .section {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .section h3 {
          margin: 0;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #5c9aff;
        }

        .section p {
          margin: 0;
          font-size: 14px;
          line-height: 1.6;
          color: #d4d4d4;
        }

        .context-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .context-list li {
          font-size: 13px;
          color: #9aa7b6;
        }

        .summary-card {
          background: #101010;
          border: 1px solid rgba(92, 154, 255, 0.15);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .summary-card p {
          margin: 0;
          font-size: 13px;
          color: #f0f0f0;
        }

        .node-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 8px;
          margin: 0 4px 4px 0;
          font-size: 12px;
          border-radius: 999px;
          border: 1px solid rgba(92, 154, 255, 0.35);
          background: rgba(92, 154, 255, 0.08);
          color: #cfe4ff;
          cursor: pointer;
          transition: background 0.15s ease, border 0.15s ease;
        }

        .node-pill:hover {
          background: rgba(92, 154, 255, 0.18);
          border-color: rgba(92, 154, 255, 0.65);
        }

        .node-pill-id {
          font-size: 11px;
          opacity: 0.65;
        }

        .node-pill-title {
          font-size: 12px;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
