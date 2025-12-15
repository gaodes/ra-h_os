"use client";

import { useEffect, useMemo, useState } from 'react';
import { isLocalMode } from '@/config/runtime';
import { apiKeyService } from '@/services/storage/apiKeys';

interface LocalKeyGateProps {
  children: React.ReactNode;
}

const panelStyle: React.CSSProperties = {
  maxWidth: 420,
  background: 'rgba(15, 15, 15, 0.92)',
  border: '1px solid #2a2a2a',
  borderRadius: 16,
  padding: '28px 32px',
  boxShadow: '0 18px 40px rgba(0,0,0,0.45)'
};

const buttonStyle: React.CSSProperties = {
  background: '#22c55e',
  color: '#0b1113',
  border: 'none',
  borderRadius: 6,
  padding: '12px 18px',
  fontWeight: 600,
  cursor: 'pointer'
};

export function LocalKeyGate({ children }: LocalKeyGateProps) {
  const isLocal = useMemo(() => isLocalMode(), []);
  const [hasKeys, setHasKeys] = useState(() => (!isLocal) || apiKeyService.hasUserKeys());

  useEffect(() => {
    if (!isLocal) return;
    const handleUpdate = () => {
      setHasKeys(apiKeyService.hasUserKeys());
    };
    handleUpdate();
    const listener = () => handleUpdate();
    window.addEventListener('api-keys:updated', listener);
    return () => window.removeEventListener('api-keys:updated', listener);
  }, [isLocal]);

  if (!isLocal || hasKeys) {
    return <>{children}</>;
  }

  const openApiKeySettings = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('settings:open', { detail: { tab: 'apikeys' } }));
    }
  };

  return (
    <>
      {children}
      <div
        style={{
          position: 'fixed',
          top: 24,
          right: 24,
          maxWidth: 420,
          zIndex: 9999
        }}
      >
        <div style={panelStyle}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ marginBottom: 8, fontSize: '20px' }}>Connect your AI keys</h2>
            <p style={{ color: '#b0b8c3', lineHeight: 1.6 }}>
              Local mode needs an OpenAI or Anthropic key. Add one under <strong>Settings → API Keys</strong>
              to unlock the workspace.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button style={buttonStyle} onClick={() => {
              openApiKeySettings();
            }}>
              Open API Key Settings
            </button>
            <button
              style={{ ...buttonStyle, background: '#1f2933', color: '#e5e7eb' }}
              onClick={() => setHasKeys(true)}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
