import type { AgentDelegation } from '@/services/agents/delegation';

interface DelegationIndicatorProps {
  delegations: AgentDelegation[];
}

export default function DelegationIndicator({ delegations }: DelegationIndicatorProps) {
  if (!delegations.length) return null;

  const activeCount = delegations.filter((d) => d.status === 'queued' || d.status === 'in_progress').length;

  if (activeCount === 0) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 8px',
      borderRadius: '4px',
      background: '#0f0f0f',
      border: '1px solid #1a1a1a',
      fontSize: '10px',
      fontFamily: "'JetBrains Mono', ui-monospace",
      color: '#6b6b6b'
    }}>
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: '#22c55e'
      }} />
      <span>{activeCount} active</span>
    </div>
  );
}
