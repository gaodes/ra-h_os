"use client";

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AgentDelegation } from '@/services/agents/delegation';

type QuickAddIntent = 'link' | 'note' | 'chat';

interface QuickAddSubmitPayload {
  input: string;
  mode: QuickAddIntent;
}

interface QuickAddInputProps {
  activeDelegations: AgentDelegation[];
  onSubmit: (payload: QuickAddSubmitPayload) => Promise<void>;
}

const MODE_CONFIG: Array<{
  key: QuickAddIntent;
  label: string;
  hint: string;
  icon: ReactNode;
}> = [
  {
    key: 'link',
    label: 'Link',
    hint: 'Drop URLs for auto YouTube/PDF/Web extraction',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M10 13a5 5 0 0 0 7.54.35l2.12-2.12a5 5 0 1 0-7.07-7.07l-1.29 1.29" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 11a5 5 0 0 0-7.54-.35l-2.12 2.12a5 5 0 1 0 7.07 7.07l1.29-1.29" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  },
  {
    key: 'note',
    label: 'Note',
    hint: 'Quick jot — no extraction, no summary',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 20h9" strokeLinecap="round" />
        <path d="M12 4h9" strokeLinecap="round" />
        <path d="M4 4h1v16H4z" />
        <path d="M7 9h7" strokeLinecap="round" />
        <path d="M7 13h5" strokeLinecap="round" />
      </svg>
    )
  },
  {
    key: 'chat',
    label: 'Chat',
    hint: 'Paste messy transcripts — store raw text + summary',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M21 15a2 2 0 0 1-2 2H9l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 8h10" strokeLinecap="round" />
        <path d="M7 12h6" strokeLinecap="round" />
      </svg>
    )
  }
];

export default function QuickAddInput({ activeDelegations, onSubmit }: QuickAddInputProps) {
  const [input, setInput] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [manualMode, setManualMode] = useState<QuickAddIntent | null>(null);
  const [autoMode, setAutoMode] = useState<QuickAddIntent>('link');
  const [autoReason, setAutoReason] = useState<string | null>(null);

  const effectiveMode: QuickAddIntent = manualMode ?? autoMode;

  const currentPlaceholder = useMemo(() => {
    if (effectiveMode === 'note') {
      return 'Write a quick note — no extraction, just append to your graph';
    }
    if (effectiveMode === 'chat') {
      return 'Paste any conversation (ChatGPT, Claude, etc.) and we will store raw text + summary';
    }
    return "Drop links, URL's, ideas or notes to add new nodes";
  }, [effectiveMode]);

  const maxConcurrent = 5;
  const activeCount = activeDelegations.filter(
    (d) => d.status === 'queued' || d.status === 'in_progress'
  ).length;
  const isSoftLimited = activeCount >= maxConcurrent;

  const inferChatIntent = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setAutoMode('link');
      setAutoReason(null);
      return;
    }

    if (manualMode) return;

    const newlineCount = (trimmed.match(/\n/g)?.length ?? 0);
    const looksLikeTranscript =
      newlineCount >= 2 ||
      /You said:|ChatGPT said:|Claude said:|Assistant:|User:/i.test(trimmed) ||
      /\b\d{1,2}:\d{2}\b/.test(trimmed);

    if (looksLikeTranscript && trimmed.length > 280) {
      setAutoMode('chat');
      setAutoReason('Detected chat transcript');
    } else {
      setAutoMode('link');
      setAutoReason(null);
    }
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    inferChatIntent(value);
  };

  const handleModeClick = (mode: QuickAddIntent) => {
    setManualMode(mode);
    setAutoMode(mode);
    setAutoReason(null);
  };

  const handleSubmit = async () => {
    if (!input.trim() || isPosting || isSoftLimited) return;

    setIsPosting(true);
    try {
      await onSubmit({ input: input.trim(), mode: effectiveMode });
      setInput('');
      setManualMode(null);
      setAutoMode('link');
      setAutoReason(null);
    } catch (error) {
      console.error('[QuickAddInput] Submit error:', error);
    } finally {
      setIsPosting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const isLinkMode = effectiveMode === 'link';
    const shouldSubmit = isLinkMode
      ? (e.key === 'Enter' && !e.shiftKey)
      : (e.key === 'Enter' && (e.metaKey || e.ctrlKey));

    if (shouldSubmit) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const renderInputField = () => {
    if (effectiveMode === 'link') {
      return (
        <input
          type="text"
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={currentPlaceholder}
          disabled={isPosting || isSoftLimited}
          autoFocus
          style={{
            flex: 1,
            padding: '12px 16px',
            background: '#0a0a0a',
            border: '2px solid #22c55e',
            borderRadius: '6px',
            color: '#e5e5e5',
            fontSize: '13px',
            fontFamily: "'JetBrains Mono', ui-monospace",
            outline: 'none',
            transition: 'all 0.15s ease',
            boxShadow: '0 0 0 3px rgba(34, 197, 94, 0.15)'
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#22c55e';
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34, 197, 94, 0.25)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#22c55e';
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34, 197, 94, 0.15)';
          }}
        />
      );
    }

    return (
      <textarea
        value={input}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={currentPlaceholder}
        disabled={isPosting || isSoftLimited}
        autoFocus
        rows={effectiveMode === 'chat' ? 6 : 4}
        style={{
          flex: 1,
          padding: '12px 16px',
          background: '#0a0a0a',
          border: '2px solid #22c55e',
          borderRadius: '6px',
          color: '#e5e5e5',
          fontSize: '13px',
          fontFamily: "'JetBrains Mono', ui-monospace",
          outline: 'none',
          transition: 'all 0.15s ease',
          resize: 'vertical',
          minHeight: effectiveMode === 'chat' ? '150px' : '110px',
          boxShadow: '0 0 0 3px rgba(34, 197, 94, 0.15)'
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = '#22c55e';
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34, 197, 94, 0.25)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = '#22c55e';
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34, 197, 94, 0.15)';
        }}
      />
    );
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    }}>
      {!isExpanded ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{
            color: '#6b6b6b',
            fontSize: '13px',
            fontFamily: "'JetBrains Mono', ui-monospace",
            textAlign: 'center'
          }}>
            Quickly add stuff
          </div>
          <button
            onClick={() => setIsExpanded(true)}
            style={{
              width: '48px',
              height: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#22c55e',
              border: 'none',
              borderRadius: '50%',
              color: '#0a0a0a',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              fontSize: '28px',
              fontWeight: 300,
              lineHeight: 1
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(34, 197, 94, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
            title="Add new content"
          >
            +
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            {MODE_CONFIG.map((mode) => {
              const isActive = effectiveMode === mode.key && (manualMode === mode.key || (!manualMode && autoMode === mode.key));
              return (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => handleModeClick(mode.key)}
                  title={mode.hint}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '999px',
                    border: `1px solid ${isActive ? '#22c55e' : '#1f1f1f'}`,
                    background: isActive ? 'rgba(34, 197, 94, 0.15)' : 'transparent',
                    color: isActive ? '#22c55e' : '#9c9c9c',
                    fontSize: '11px',
                    fontFamily: "'JetBrains Mono', ui-monospace",
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{mode.icon}</span>
                  {mode.label}
                </button>
              );
            })}
          </div>
          {autoReason && !manualMode && (
            <div style={{
              textAlign: 'center',
              color: '#9c9c9c',
              fontSize: '11px',
              letterSpacing: '0.05em',
              textTransform: 'uppercase'
            }}>
              Auto-detected chat transcript
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
            {renderInputField()}
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isPosting || isSoftLimited}
              aria-label={isPosting ? 'Adding' : 'Add'}
              title={isPosting ? 'Adding…' : 'Add (Enter)'}
              style={{
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: input.trim() && !isPosting && !isSoftLimited ? '#22c55e' : '#22c55e',
                border: `2px solid #22c55e`,
                borderRadius: '50%',
                color: input.trim() && !isPosting && !isSoftLimited ? '#0a0a0a' : '#0a0a0a',
                cursor: input.trim() && !isPosting && !isSoftLimited ? 'pointer' : 'not-allowed',
                transition: 'all 150ms ease',
                opacity: input.trim() && !isPosting && !isSoftLimited ? 1 : 0.7,
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                if (input.trim() && !isPosting && !isSoftLimited) {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(34, 197, 94, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (input.trim() && !isPosting && !isSoftLimited) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              {isPosting ? (
                <span style={{ fontSize: '12px' }}>•••</span>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path d="M12 4l-6.5 6.5 1.42 1.42L11 8.84V20h2V8.84l4.08 3.08 1.42-1.42L12 4z"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
      
      {/* Active processing indicator */}
      {activeCount > 0 && (
        <div style={{
          padding: '10px 14px',
          background: '#0a1a0a',
          border: '1px solid #1a3a1a',
          borderRadius: '6px',
          color: '#22c55e',
          fontSize: '11px',
          fontFamily: "'JetBrains Mono', ui-monospace",
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#22c55e',
            animation: 'pulse 2s ease-in-out infinite'
          }} />
          <span>
            {activeCount === 1 
              ? 'Adding 1 node to your database...' 
              : `Adding ${activeCount} nodes to your database...`}
          </span>
        </div>
      )}
      
      {isSoftLimited && (
        <div style={{
          padding: '10px 14px',
          background: '#1a0a00',
          border: '1px solid #3a2a1a',
          borderRadius: '6px',
          color: '#ff9b5c',
          fontSize: '11px',
          fontFamily: "'JetBrains Mono', ui-monospace",
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>⚠</span>
          <span>Finish one of the 5 active Quick Adds before adding more.</span>
        </div>
      )}
      
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
