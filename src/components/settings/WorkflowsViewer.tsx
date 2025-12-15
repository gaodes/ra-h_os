"use client";

import { useState, useEffect } from 'react';

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
    const loadWorkflows = async () => {
      try {
        const response = await fetch('/api/workflows');
        const result = await response.json();
        if (result.success) {
          setWorkflows(result.data);
        }
      } catch (error) {
        console.error('Failed to load workflows:', error);
      } finally {
        setLoading(false);
      }
    };
    loadWorkflows();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#888' }}>
        Loading workflows...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: '100%' }}>
      <div style={{ marginBottom: '32px' }}>
        <p style={{ color: '#888', fontSize: '14px', marginBottom: '24px' }}>
          Read-only view of all predefined workflows. Click to expand instructions.
        </p>

        {workflows.length === 0 && (
          <div style={{ color: '#666', fontSize: '14px', textAlign: 'center', padding: '32px' }}>
            No workflows defined yet.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {workflows.map((workflow) => {
            const isExpanded = expandedId === workflow.id;
            
            return (
              <div
                key={workflow.id}
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #2a2a2a',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}
              >
                {/* Header */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : workflow.id)}
                  style={{
                    padding: '16px 20px',
                    cursor: 'pointer',
                    borderBottom: isExpanded ? '1px solid #2a2a2a' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#fff' }}>
                        {workflow.displayName}
                      </h3>
                      <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#666' }}>
                        {workflow.key}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {workflow.enabled ? (
                        <span style={{ fontSize: '12px', color: '#10b981', padding: '4px 8px', background: '#10b98120', borderRadius: '4px' }}>
                          Enabled
                        </span>
                      ) : (
                        <span style={{ fontSize: '12px', color: '#ef4444', padding: '4px 8px', background: '#ef444420', borderRadius: '4px' }}>
                          Disabled
                        </span>
                      )}
                      <span style={{ fontSize: '18px', color: '#666', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                        ▼
                      </span>
                    </div>
                  </div>

                  <div style={{ fontSize: '14px', color: '#aaa', marginBottom: '12px' }}>
                    {workflow.description}
                  </div>

                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: '#666' }}>Requires Node:</span>{' '}
                      <span style={{ color: workflow.requiresFocusedNode ? '#f59e0b' : '#666' }}>
                        {workflow.requiresFocusedNode ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: '#666' }}>Primary Actor:</span>{' '}
                      <span style={{ color: '#8b5cf6' }}>
                        {workflow.primaryActor === 'oracle' ? 'Wise RA-H (GPT-5)' : 'Main RA-H'}
                      </span>
                    </div>
                    {workflow.expectedOutcome && (
                      <div style={{ fontSize: '12px', flex: '1 1 100%' }}>
                        <span style={{ color: '#666' }}>Expected Outcome:</span>{' '}
                        <span style={{ color: '#aaa' }}>
                          {workflow.expectedOutcome}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded Instructions */}
                {isExpanded && (
                  <div style={{ padding: '20px', background: '#0f0f0f' }}>
                    <div style={{ marginBottom: '12px', fontSize: '13px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Workflow Instructions
                    </div>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        color: '#ddd',
                        whiteSpace: 'pre-wrap',
                        lineHeight: '1.6',
                        padding: '16px',
                        background: '#1a1a1a',
                        border: '1px solid #2a2a2a',
                        borderRadius: '6px',
                        maxHeight: '400px',
                        overflowY: 'auto',
                      }}
                    >
                      {workflow.instructions}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
