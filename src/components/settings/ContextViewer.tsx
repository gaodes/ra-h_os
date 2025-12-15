"use client";

import { useEffect, useMemo, useState } from 'react';
import type { Node } from '@/types/database';

interface AutoContextSettings {
  autoContextEnabled: boolean;
  lastPinnedMigration?: string;
}

interface NodeWithMetrics extends Node {
  edge_count?: number;
}

export default function ContextViewer() {
  const [nodes, setNodes] = useState<NodeWithMetrics[]>([]);
  const [autoContextEnabled, setAutoContextEnabled] = useState(false);
  const [lastMigrated, setLastMigrated] = useState<string | undefined>();
  const [loadingNodes, setLoadingNodes] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadNodes = async () => {
      setLoadingNodes(true);
      try {
        const response = await fetch('/api/nodes?sortBy=edges&limit=10');
        if (!response.ok) {
          throw new Error('Failed to load nodes');
        }
        const payload = await response.json();
        setNodes(payload.data || []);
      } catch (err) {
        console.error(err);
        setError('Unable to load top nodes.');
      } finally {
        setLoadingNodes(false);
      }
    };

    const loadSettings = async () => {
      setLoadingSettings(true);
      try {
        const response = await fetch('/api/system/auto-context');
        if (!response.ok) {
          throw new Error('Failed to load auto-context settings');
        }
        const payload = (await response.json()) as {
          success: boolean;
          data?: AutoContextSettings;
        };
        if (payload.success && payload.data) {
          setAutoContextEnabled(Boolean(payload.data.autoContextEnabled));
          setLastMigrated(payload.data.lastPinnedMigration);
        }
      } catch (err) {
        console.error(err);
        setError('Unable to load auto-context settings.');
      } finally {
        setLoadingSettings(false);
      }
    };

    loadNodes();
    loadSettings();
  }, []);

  const toggleDescription = useMemo(() => {
    if (!autoContextEnabled) {
      return 'Disabled — chats and workflows will not receive BACKGROUND CONTEXT.';
    }
    return 'Enabled — top 10 most-connected nodes will be added to BACKGROUND CONTEXT.';
  }, [autoContextEnabled]);

  const handleToggle = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/system/auto-context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoContextEnabled: !autoContextEnabled }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as {
        success: boolean;
        data?: AutoContextSettings;
      };

      if (payload.success && payload.data) {
        setAutoContextEnabled(payload.data.autoContextEnabled);
        setLastMigrated(payload.data.lastPinnedMigration);
      } else {
        throw new Error(payload?.data ? 'Settings update failed' : 'Unknown error');
      }
    } catch (err) {
      console.error('Failed to update auto-context toggle', err);
      setError('Unable to update setting. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '24px', color: '#f8fafc' }}>
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '18px' }}>Auto-Context</h3>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px', lineHeight: 1.6 }}>
          Auto-context grabs your 10 nodes with the most edges and drops them into BACKGROUND
          CONTEXT so ra-h knows which ideas connect everything else.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          border: '1px solid #1f2937',
          borderRadius: '10px',
          background: '#050505',
          marginBottom: '24px',
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>Enable Auto-Context</div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            {loadingSettings ? 'Loading preference…' : toggleDescription}
          </div>
        </div>
        <button
          onClick={handleToggle}
          disabled={loadingSettings || saving}
          style={{
            width: '58px',
            height: '30px',
            borderRadius: '999px',
            border: 'none',
            cursor: saving ? 'wait' : 'pointer',
            background: autoContextEnabled ? '#22c55e' : '#334155',
            position: 'relative',
            transition: 'background 0.2s ease',
          }}
          title={autoContextEnabled ? 'Disable auto-context' : 'Enable auto-context'}
        >
          <span
            style={{
              position: 'absolute',
              top: '4px',
              left: autoContextEnabled ? '32px' : '4px',
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s ease',
            }}
          />
        </button>
      </div>

      {lastMigrated && (
        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '16px' }}>
          Auto-enabled because you previously pinned nodes · {new Date(lastMigrated).toLocaleString()}
        </div>
      )}

      <div>
        <div style={{ fontWeight: 600, marginBottom: '12px' }}>Top 10 nodes by connections</div>
        {loadingNodes ? (
          <div style={{ color: '#94a3b8', fontSize: '13px' }}>Loading nodes…</div>
        ) : nodes.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: '13px' }}>
            No connected nodes yet. Create nodes and add edges to see context hubs.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {nodes.map((node) => (
              <div
                key={node.id}
                style={{
                  border: '1px solid #1f2937',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  background: '#080808',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    [NODE:{node.id}] {node.title || 'Untitled node'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#facc15' }}>
                    {node.edge_count ?? 0} connections
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {node.dimensions && node.dimensions.length > 0 ? (
                    node.dimensions.slice(0, 4).map((dimension) => (
                      <span
                        key={`${node.id}-${dimension}`}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          background: '#132018',
                          color: '#86efac',
                        }}
                      >
                        {dimension}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: '11px', color: '#64748b' }}>No dimensions</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginTop: '24px', color: '#f87171', fontSize: '12px' }}>
          {error}
        </div>
      )}
    </div>
  );
}
