"use client";

import { useState, useEffect } from 'react';

interface ToolGroup {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export default function ToolsViewer() {
  const [groups, setGroups] = useState<Record<string, ToolGroup>>({});
  const [groupedTools, setGroupedTools] = useState<Record<string, { name: string; description: string }[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTools = async () => {
      try {
        const response = await fetch('/api/tools');
        const result = await response.json();
        if (result.success) {
          setGroups(result.data.groups);
          setGroupedTools(result.data.tools);
        }
      } catch (error) {
        console.error('Failed to load tools:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTools();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#888' }}>
        Loading tools...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: '100%' }}>
      <div style={{ marginBottom: '32px' }}>
        <p style={{ color: '#888', fontSize: '14px', marginBottom: '24px' }}>
          Read-only view of all tools available in the system, grouped by function.
        </p>

        {Object.entries(groups).map(([groupId, group]) => {
          const tools = groupedTools[groupId] || [];
          if (tools.length === 0) return null;

          return (
            <div key={groupId} style={{ marginBottom: '32px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                  paddingBottom: '8px',
                  borderBottom: `2px solid ${group.color}`,
                }}
              >
                <span style={{ color: group.color, fontSize: '16px' }}>{group.icon}</span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#fff' }}>
                  {group.name}
                </h3>
                <span style={{ fontSize: '13px', color: '#666', marginLeft: '8px' }}>
                  ({tools.length} tools)
                </span>
              </div>

              <div style={{ fontSize: '13px', color: '#888', marginBottom: '16px', fontStyle: 'italic' }}>
                {group.description}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {tools.map((tool) => (
                  <div
                    key={tool.name}
                    style={{
                      padding: '12px 16px',
                      background: '#1a1a1a',
                      border: '1px solid #2a2a2a',
                      borderRadius: '6px',
                    }}
                  >
                    <div style={{ fontFamily: 'monospace', fontSize: '13px', color: '#3b82f6', marginBottom: '6px' }}>
                      {tool.name}
                    </div>
                    <div style={{ fontSize: '13px', color: '#aaa', lineHeight: '1.5' }}>
                      {tool.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
