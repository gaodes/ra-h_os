import { Fragment, ReactNode, useMemo } from 'react';
import type { AgentDelegation } from '@/services/agents/delegation';

const statusPalette: Record<string, { border: string; badge: string }> = {
  queued: { border: '#3a2f5f', badge: '#a78bfa' },
  in_progress: { border: '#4a3a6f', badge: '#8b5cf6' },
  completed: { border: '#2a2a2a', badge: '#6b6b6b' },
  failed: { border: '#5f2a2a', badge: '#ff6b6b' },
};

const NODE_LINK_REGEX = /\[NODE:(\d+):"([^"]+)"\]/g;
const SUMMARY_HEADERS = ['Task', 'Actions', 'Result', 'Nodes', 'Follow-up'];

interface WiseRAHPanelProps {
  delegation: AgentDelegation;
  onNodeClick?: (nodeId: number) => void;
}

function formatStatus(status: string) {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'in_progress':
      return 'Planning';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

function renderNodeAwareText(text: string, onNodeClick?: (nodeId: number) => void): ReactNode {
  const segments: ReactNode[] = [];
  let lastIndex = 0;

  text.replace(NODE_LINK_REGEX, (match, id, title, offset) => {
    if (offset > lastIndex) {
      segments.push(<span key={`text-${offset}`}>{text.slice(lastIndex, offset)}</span>);
    }
    const nodeId = Number(id);
    const handleClick = () => {
      if (onNodeClick) {
        onNodeClick(nodeId);
      }
    };
    segments.push(
      <button
        key={`node-${offset}`}
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
    segments.push(<span key={`text-end`}>{text.slice(lastIndex)}</span>);
  }

  return <>{segments}</>;
}

function parseSummary(summary: string) {
  const lines = summary.split('\n');
  const sections: Array<{ title: string; lines: string[] }> = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const header = SUMMARY_HEADERS.find(h => line.toLowerCase().startsWith(`${h.toLowerCase()}:`));
    if (header) {
      const content = line.slice(header.length + 1).trim();
      current = { title: header, lines: [] };
      if (content) current.lines.push(content);
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      if (!current) {
        current = { title: 'Summary', lines: [] };
        sections.push(current);
      }
      current.lines.push(line);
    }
  }

  return sections;
}

function renderSectionLines(lines: string[], onNodeClick?: (nodeId: number) => void) {
  const hasBullet = lines.some(line => /^[-*•]/.test(line.trim()));

  if (hasBullet) {
    return (
      <ul className="summary-list">
        {lines.map((line, idx) => {
          const text = line.replace(/^[-*•]\s*/, '').trim();
          return (
            <li key={idx}>
              {renderNodeAwareText(text, onNodeClick)}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="summary-paragraphs">
      {lines.map((line, idx) => (
        <p key={idx}>{renderNodeAwareText(line, onNodeClick)}</p>
      ))}
    </div>
  );
}

export default function WiseRAHPanel({ delegation, onNodeClick }: WiseRAHPanelProps) {
  const palette = statusPalette[delegation.status] ?? statusPalette.queued;

  const parsedSummary = useMemo(() => {
    if (!delegation.summary) return [];
    return parseSummary(delegation.summary);
  }, [delegation.summary]);

  return (
    <div className="wise-panel">
      <header className="wise-header" style={{ borderBottomColor: palette.border }}>
        <span className="status-dot" style={{ background: palette.badge }} />
        <span className="header-title">WISE RA-H</span>
        <span className="header-status">· {formatStatus(delegation.status)}</span>
        <span className="header-time">{new Date(delegation.updatedAt).toLocaleTimeString()}</span>
      </header>

      <section className="section">
        <h3>Goal</h3>
        <p>{delegation.task}</p>
      </section>

      {delegation.context.length > 0 && (
        <section className="section">
          <h3>Context</h3>
          <ul className="context-list">
            {delegation.context.map((item, idx) => (
              <li key={idx}>{renderNodeAwareText(item, onNodeClick)}</li>
            ))}
          </ul>
        </section>
      )}

      {parsedSummary.length > 0 && (
        <section className="section">
          <h3>Summary</h3>
          <div className="summary-card">
            {parsedSummary.map(section => (
              <div key={section.title} className="summary-section">
                <div className="summary-title">{section.title}</div>
                {renderSectionLines(section.lines, onNodeClick)}
              </div>
            ))}
          </div>
        </section>
      )}

      <style jsx>{`
        .wise-panel {
          display: flex;
          flex-direction: column;
          gap: 18px;
          padding: 24px;
          background: #0a0a0a;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          height: 100%;
          overflow-y: auto;
        }

        .wise-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(167, 139, 250, 0.35);
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
          color: #bba4ff;
        }

        .header-status {
          font-size: 12px;
          color: #8b82a6;
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
          color: #a78bfa;
        }

        .section p {
          margin: 0;
          font-size: 14px;
          line-height: 1.6;
          color: #d4d4d4;
        }

        .context-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .context-list li {
          font-size: 13px;
          color: #a0a0a0;
        }

        .summary-card {
          background: #101010;
          border: 1px solid rgba(167, 139, 250, 0.1);
          border-radius: 12px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .summary-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .summary-title {
          font-size: 12px;
          font-weight: 600;
          color: #c5b5ff;
          letter-spacing: 0.05em;
        }

        .summary-paragraphs p {
          margin: 0;
          font-size: 13px;
          color: #e5e5e5;
          line-height: 1.6;
        }

        .summary-list {
          margin: 0;
          padding-left: 18px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .summary-list li {
          font-size: 13px;
          color: #e5e5e5;
          line-height: 1.6;
        }

        .node-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          margin: 0 4px 4px 0;
          font-size: 12px;
          border-radius: 999px;
          border: 1px solid rgba(167, 139, 250, 0.3);
          background: rgba(167, 139, 250, 0.08);
          color: #d8d3ff;
          cursor: pointer;
          transition: background 0.15s ease, border 0.15s ease;
        }

        .node-pill:hover {
          background: rgba(167, 139, 250, 0.18);
          border: 1px solid rgba(167, 139, 250, 0.6);
        }

        .node-pill-id {
          font-size: 11px;
          opacity: 0.7;
        }

        .node-pill-title {
          font-size: 12px;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
