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
  isBundled?: boolean;
  hasUserOverride?: boolean;
}

interface EditingWorkflow {
  key: string;
  displayName: string;
  description: string;
  instructions: string;
  enabled: boolean;
  requiresFocusedNode: boolean;
  isNew: boolean;
}

export default function WorkflowsViewer() {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingWorkflow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkflows = async () => {
    try {
      const res = await fetch('/api/workflows');
      const result = await res.json();
      if (result.success) {
        // Fetch additional metadata for each workflow
        const enriched = await Promise.all(
          result.data.map(async (w: WorkflowDefinition) => {
            try {
              const detailRes = await fetch(`/api/workflows/${w.key}`);
              const detail = await detailRes.json();
              return detail.success ? detail.data : w;
            } catch {
              return w;
            }
          })
        );
        setWorkflows(enriched);
      }
    } catch (e) {
      console.error('Failed to load workflows:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkflows();
  }, []);

  const handleEdit = (workflow: WorkflowDefinition) => {
    setEditing({
      key: workflow.key,
      displayName: workflow.displayName,
      description: workflow.description,
      instructions: workflow.instructions,
      enabled: workflow.enabled,
      requiresFocusedNode: workflow.requiresFocusedNode,
      isNew: false,
    });
    setError(null);
  };

  const handleNewWorkflow = () => {
    setEditing({
      key: '',
      displayName: '',
      description: '',
      instructions: '',
      enabled: true,
      requiresFocusedNode: true,
      isNew: true,
    });
    setError(null);
  };

  const handleCancel = () => {
    setEditing(null);
    setError(null);
  };

  const generateKey = (name: string): string => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleSave = async () => {
    if (!editing) return;

    const key = editing.isNew ? generateKey(editing.displayName) : editing.key;

    if (!key) {
      setError('Please enter a workflow name');
      return;
    }

    if (!editing.instructions.trim()) {
      setError('Please enter instructions');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/workflows/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: editing.displayName,
          description: editing.description,
          instructions: editing.instructions,
          enabled: editing.enabled,
          requiresFocusedNode: editing.requiresFocusedNode,
        }),
      });

      const result = await res.json();

      if (result.success) {
        setEditing(null);
        await loadWorkflows();
      } else {
        setError(result.error || 'Failed to save workflow');
      }
    } catch (e) {
      setError('Failed to save workflow');
      console.error('Save error:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (workflow: WorkflowDefinition) => {
    const action = workflow.isBundled ? 'reset to default' : 'delete';
    if (!confirm(`Are you sure you want to ${action} "${workflow.displayName}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/workflows/${workflow.key}`, {
        method: 'DELETE',
      });

      const result = await res.json();

      if (result.success) {
        await loadWorkflows();
      } else {
        alert(result.error || 'Failed to delete workflow');
      }
    } catch (e) {
      alert('Failed to delete workflow');
      console.error('Delete error:', e);
    }
  };

  if (loading) {
    return <div style={loadingStyle}>Loading...</div>;
  }

  // Editing view
  if (editing) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>
            {editing.isNew ? 'New Workflow' : `Edit: ${editing.displayName}`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleCancel} style={buttonStyle} disabled={saving}>
              Cancel
            </button>
            <button onClick={handleSave} style={primaryButtonStyle} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        <div style={formStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Name</label>
            <input
              type="text"
              value={editing.displayName}
              onChange={(e) => setEditing({ ...editing, displayName: e.target.value })}
              placeholder="My Workflow"
              style={inputStyle}
              disabled={saving}
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Description (shown to agent)</label>
            <input
              type="text"
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              placeholder="Brief description of what this workflow does"
              style={inputStyle}
              disabled={saving}
            />
            <span style={hintStyle}>Keep this short — it tells the agent when to use this workflow</span>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Instructions</label>
            <textarea
              value={editing.instructions}
              onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
              placeholder="Enter the workflow instructions..."
              style={textareaStyle}
              disabled={saving}
            />
          </div>

          <div style={checkboxRowStyle}>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={editing.enabled}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
                disabled={saving}
              />
              Enabled
            </label>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={editing.requiresFocusedNode}
                onChange={(e) => setEditing({ ...editing, requiresFocusedNode: e.target.checked })}
                disabled={saving}
              />
              Requires focused node
            </label>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <p style={descStyle}>Workflows available to the agent.</p>
        <button onClick={handleNewWorkflow} style={primaryButtonStyle}>
          + New Workflow
        </button>
      </div>

      {workflows.length === 0 ? (
        <div style={emptyStyle}>No workflows defined.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {workflows.map((w) => (
            <div key={w.key} style={cardStyle}>
              <div style={cardContentStyle}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={titleStyle}>{w.displayName}</span>
                    <span style={keyStyle}>{w.key}</span>
                    {w.hasUserOverride && w.isBundled && (
                      <span style={modifiedBadgeStyle}>modified</span>
                    )}
                    {!w.enabled && (
                      <span style={disabledBadgeStyle}>disabled</span>
                    )}
                  </div>
                  <div style={descRowStyle}>{w.description}</div>
                </div>
                <div style={actionsStyle}>
                  <button onClick={() => handleEdit(w)} style={buttonStyle}>
                    Edit
                  </button>
                  {/* Show delete for user-created, or reset for modified bundled */}
                  {(!w.isBundled || w.hasUserOverride) && (
                    <button
                      onClick={() => handleDelete(w)}
                      style={w.isBundled ? resetButtonStyle : deleteButtonStyle}
                    >
                      {w.isBundled ? 'Reset' : 'Delete'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Styles
const containerStyle: CSSProperties = { padding: 24, height: '100%', overflow: 'auto' };
const loadingStyle: CSSProperties = { padding: 24, color: '#6b7280' };
const descStyle: CSSProperties = { fontSize: 13, color: '#6b7280', margin: 0 };
const emptyStyle: CSSProperties = { fontSize: 13, color: '#6b7280', textAlign: 'center', padding: 32 };

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 20,
};

const cardStyle: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: 8,
  overflow: 'hidden',
};

const cardContentStyle: CSSProperties = {
  padding: '14px 16px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
};

const titleStyle: CSSProperties = { fontSize: 13, fontWeight: 500, color: '#e5e7eb' };
const keyStyle: CSSProperties = { fontSize: 11, fontFamily: 'monospace', color: '#6b7280' };
const descRowStyle: CSSProperties = { fontSize: 12, color: '#9ca3af', lineHeight: 1.5 };

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  flexShrink: 0,
};

const buttonStyle: CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: 6,
  color: '#e5e7eb',
  cursor: 'pointer',
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'rgba(34, 197, 94, 0.2)',
  borderColor: 'rgba(34, 197, 94, 0.3)',
  color: '#22c55e',
};

const deleteButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'rgba(239, 68, 68, 0.1)',
  borderColor: 'rgba(239, 68, 68, 0.2)',
  color: '#ef4444',
};

const resetButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: 'rgba(251, 191, 36, 0.1)',
  borderColor: 'rgba(251, 191, 36, 0.2)',
  color: '#fbbf24',
};

const modifiedBadgeStyle: CSSProperties = {
  fontSize: 10,
  padding: '2px 6px',
  background: 'rgba(251, 191, 36, 0.15)',
  color: '#fbbf24',
  borderRadius: 4,
};

const disabledBadgeStyle: CSSProperties = {
  fontSize: 10,
  padding: '2px 6px',
  background: 'rgba(107, 114, 128, 0.2)',
  color: '#6b7280',
  borderRadius: 4,
};

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: '#9ca3af',
};

const hintStyle: CSSProperties = {
  fontSize: 11,
  color: '#6b7280',
};

const inputStyle: CSSProperties = {
  padding: '10px 12px',
  fontSize: 13,
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: 6,
  color: '#e5e7eb',
  outline: 'none',
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 300,
  fontFamily: 'monospace',
  fontSize: 12,
  lineHeight: 1.6,
  resize: 'vertical',
};

const checkboxRowStyle: CSSProperties = {
  display: 'flex',
  gap: 24,
};

const checkboxLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  color: '#e5e7eb',
  cursor: 'pointer',
};

const errorStyle: CSSProperties = {
  padding: '10px 12px',
  marginBottom: 16,
  background: 'rgba(239, 68, 68, 0.1)',
  border: '1px solid rgba(239, 68, 68, 0.2)',
  borderRadius: 6,
  color: '#ef4444',
  fontSize: 13,
};
