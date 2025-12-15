"use client";

import { useState, useEffect } from 'react';
import { apiKeyService, ApiKeyStatus } from '@/services/storage/apiKeys';

export default function ApiKeysViewer() {
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [status, setStatus] = useState<ApiKeyStatus>({
    openai: 'not-set',
    anthropic: 'not-set'
  });
  const [showKeys, setShowKeys] = useState(false);

  useEffect(() => {
    // Load existing keys and status
    const stored = apiKeyService.getStoredKeys();
    setOpenaiKey(stored.openai || '');
    setAnthropicKey(stored.anthropic || '');
    setStatus(apiKeyService.getStatus());
  }, []);

  const handleSaveOpenAi = async () => {
    if (!openaiKey.trim()) return;
    
    try {
      apiKeyService.setOpenAiKey(openaiKey.trim());
      // Test the connection
      const isConnected = await apiKeyService.testOpenAiConnection();
      setStatus(prev => ({ ...prev, openai: isConnected ? 'connected' : 'failed' }));
      
      if (isConnected) {
        alert('OpenAI API key saved and connection verified!');
      } else {
        alert('OpenAI API key saved but connection failed. Please check your key.');
      }
    } catch (error) {
      alert(`Failed to save OpenAI key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleSaveAnthropic = async () => {
    if (!anthropicKey.trim()) return;
    
    try {
      apiKeyService.setAnthropicKey(anthropicKey.trim());
      // Test the connection
      const isConnected = await apiKeyService.testAnthropicConnection();
      setStatus(prev => ({ ...prev, anthropic: isConnected ? 'connected' : 'failed' }));
      
      if (isConnected) {
        alert('Anthropic API key saved and connection verified!');
      } else {
        alert('Anthropic API key saved but connection failed. Please check your key.');
      }
    } catch (error) {
      alert(`Failed to save Anthropic key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleTestOpenAi = async () => {
    setStatus(prev => ({ ...prev, openai: 'testing' }));
    const isConnected = await apiKeyService.testOpenAiConnection();
    setStatus(prev => ({ ...prev, openai: isConnected ? 'connected' : 'failed' }));
  };

  const handleTestAnthropic = async () => {
    setStatus(prev => ({ ...prev, anthropic: 'testing' }));
    const isConnected = await apiKeyService.testAnthropicConnection();
    setStatus(prev => ({ ...prev, anthropic: isConnected ? 'connected' : 'failed' }));
  };

  const handleClearOpenAi = () => {
    apiKeyService.clearOpenAiKey();
    setOpenaiKey('');
    setStatus(prev => ({ ...prev, openai: 'not-set' }));
  };

  const handleClearAnthropic = () => {
    apiKeyService.clearAnthropicKey();
    setAnthropicKey('');
    setStatus(prev => ({ ...prev, anthropic: 'not-set' }));
  };

  const getStatusIcon = (statusValue: string) => {
    switch (statusValue) {
      case 'connected': return '✅';
      case 'failed': return '❌';
      case 'testing': return '⏳';
      default: return '⚪';
    }
  };

  const getStatusColor = (statusValue: string) => {
    switch (statusValue) {
      case 'connected': return '#22c55e';
      case 'failed': return '#ef4444';
      case 'testing': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  return (
    <div style={{ 
      padding: '24px', 
      height: '100%', 
      overflow: 'auto',
      background: '#0f0f0f',
      color: '#fff'
    }}>
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600' }}>
          API Configuration
        </h3>
        <p style={{ margin: 0, fontSize: '14px', color: '#888', lineHeight: '1.5' }}>
          Keys are stored locally and never shared with RA-H servers.
        </p>
      </div>

      {/* Show/Hide Keys Toggle */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ 
          display: 'flex', 
          alignItems: 'center', 
          fontSize: '14px', 
          cursor: 'pointer',
          color: '#888'
        }}>
          <input
            type="checkbox"
            checked={showKeys}
            onChange={(e) => setShowKeys(e.target.checked)}
            style={{ marginRight: '8px' }}
          />
          Show API keys in plain text
        </label>
      </div>

      {/* OpenAI Section */}
      <div style={{ 
        marginBottom: '32px', 
        padding: '20px', 
        border: '1px solid #2a2a2a', 
        borderRadius: '8px',
        background: '#0a0a0a'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          marginBottom: '16px' 
        }}>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>
            OpenAI API Key
          </h4>
          <div style={{ 
            marginLeft: '12px', 
            display: 'flex', 
            alignItems: 'center', 
            fontSize: '12px',
            color: getStatusColor(status.openai)
          }}>
            <span style={{ marginRight: '4px' }}>
              {getStatusIcon(status.openai)}
            </span>
            <span>
              {status.openai === 'connected' && 'Connected'}
              {status.openai === 'failed' && 'Connection Failed'}
              {status.openai === 'testing' && 'Testing...'}
              {status.openai === 'not-set' && 'Not Set'}
            </span>
          </div>
        </div>
        
        <div style={{ marginBottom: '12px' }}>
          <input
            type={showKeys ? 'text' : 'password'}
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder="sk-proj-... or sk-..."
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '6px',
              color: '#fff',
              fontFamily: 'monospace'
            }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={handleSaveOpenAi}
            disabled={!openaiKey.trim()}
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              background: '#22c55e',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: openaiKey.trim() ? 'pointer' : 'not-allowed',
              opacity: openaiKey.trim() ? 1 : 0.5
            }}
          >
            Save & Test
          </button>
          
          
          <button
            onClick={handleClearOpenAi}
            disabled={!openaiKey}
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: openaiKey ? 'pointer' : 'not-allowed',
              opacity: openaiKey ? 1 : 0.5
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Anthropic Section */}
      <div style={{ 
        marginBottom: '32px', 
        padding: '20px', 
        border: '1px solid #2a2a2a', 
        borderRadius: '8px',
        background: '#0a0a0a'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          marginBottom: '16px' 
        }}>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>
            Anthropic API Key
          </h4>
          <div style={{ 
            marginLeft: '12px', 
            display: 'flex', 
            alignItems: 'center', 
            fontSize: '12px',
            color: getStatusColor(status.anthropic)
          }}>
            <span style={{ marginRight: '4px' }}>
              {getStatusIcon(status.anthropic)}
            </span>
            <span>
              {status.anthropic === 'connected' && 'Connected'}
              {status.anthropic === 'failed' && 'Connection Failed'}
              {status.anthropic === 'testing' && 'Testing...'}
              {status.anthropic === 'not-set' && 'Not Set'}
            </span>
          </div>
        </div>
        
        <div style={{ marginBottom: '12px' }}>
          <input
            type={showKeys ? 'text' : 'password'}
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            placeholder="sk-ant-api03-..."
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '6px',
              color: '#fff',
              fontFamily: 'monospace'
            }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={handleSaveAnthropic}
            disabled={!anthropicKey.trim()}
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              background: '#22c55e',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: anthropicKey.trim() ? 'pointer' : 'not-allowed',
              opacity: anthropicKey.trim() ? 1 : 0.5
            }}
          >
            Save & Test
          </button>
          
          
          <button
            onClick={handleClearAnthropic}
            disabled={!anthropicKey}
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: anthropicKey ? 'pointer' : 'not-allowed',
              opacity: anthropicKey ? 1 : 0.5
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Help Section */}
      <div style={{ 
        padding: '16px', 
        background: '#1a1a1a', 
        border: '1px solid #333', 
        borderRadius: '6px',
        fontSize: '12px',
        color: '#888',
        lineHeight: '1.5'
      }}>
        <h5 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '13px' }}>
          How to get API keys:
        </h5>
        <ul style={{ margin: 0, paddingLeft: '16px' }}>
          <li style={{ marginBottom: '4px' }}>
            <strong>OpenAI:</strong> Visit <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: '#22c55e' }}>platform.openai.com/api-keys</a>
          </li>
          <li>
            <strong>Anthropic:</strong> Visit <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ color: '#22c55e' }}>console.anthropic.com/settings/keys</a>
          </li>
        </ul>
        <p style={{ margin: '12px 0 0 0', fontSize: '11px' }}>
          Your keys are stored locally and never sent to RA-H servers. They are only used to communicate directly with OpenAI and Anthropic APIs.
        </p>
      </div>
    </div>
  );
}