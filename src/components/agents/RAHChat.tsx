"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Node } from '@/types/database';
import AsciiBanner from './AsciiBanner';
import TerminalMessage from './TerminalMessage';
import TerminalInput from './TerminalInput';
import { Zap, Flame } from 'lucide-react';
import { useSSEChat, ChatMessage, MessageRole } from './hooks/useSSEChat';
import { useQuotaHandler } from '@/hooks/useQuotaHandler';

// Stub type for delegation (delegation system removed in rah-light)
type AgentDelegation = {
  id: number;
  sessionId: string;
  task: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  summary?: string | null;
  agentType: string;
  createdAt: string;
  updatedAt: string;
};

// Stub DelegationIndicator component (delegation system removed)
function DelegationIndicator({ delegations }: { delegations: AgentDelegation[] }) {
  return null;
}

const createSessionId = () => `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

interface HighlightedPassage {
  selectedText: string;
  nodeId: number;
  nodeTitle: string;
}

interface RAHChatProps {
  openTabsData: Node[];
  activeTabId: number | null;
  activeDimension?: string | null;
  onClearDimension?: () => void;
  onNodeClick?: (nodeId: number) => void;
  delegations?: AgentDelegation[];
  messages?: ChatMessage[];
  setMessages?: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  mode?: 'easy' | 'hard';
  delegationMode?: boolean;
  delegationSessionId?: string;
  onQuickAdd?: () => void;
  highlightedPassage?: HighlightedPassage | null;
  onClearPassage?: () => void;
}

export default function RAHChat({
  openTabsData,
  activeTabId,
  activeDimension,
  onClearDimension: _onClearDimension,
  onNodeClick,
  delegations = [],
  messages: externalMessages,
  setMessages: externalSetMessages,
  mode = 'easy',
  delegationMode = false,
  delegationSessionId,
  onQuickAdd: _onQuickAdd,
  highlightedPassage: _highlightedPassage,
  onClearPassage: _onClearPassage,
}: RAHChatProps) {
  // Use external state if provided (lifted state), otherwise use local state
  const [internalMessages, internalSetMessages] = useState<ChatMessage[]>([]);
  const messages = externalMessages !== undefined ? externalMessages : internalMessages;
  const setMessages = externalSetMessages || internalSetMessages;

  const [sessionId, setSessionId] = useState(() => createSessionId());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatMode = mode === 'hard' ? 'hard' : 'easy';
  const helperKey = chatMode === 'hard' ? 'ra-h' : 'ra-h-easy';
  const helperDisplayName = helperKey === 'ra-h' ? 'ra-h (hard)' : 'ra-h (easy)';
  const {
    quotaError,
    handleAPIError: handleQuotaApiError,
    checkQuotaBeforeRequest,
    refetchUsage,
    isQuotaExceeded,
  } = useQuotaHandler();
  const streamCompleteHandlerRef = useRef<() => Promise<void> | void>(async () => {
    await refetchUsage();
  });
  const setMessagesRef = useRef(setMessages);

  const sse = useSSEChat('/api/rah/chat', setMessages, {
    getAuthToken: () => null,
    beforeRequest: checkQuotaBeforeRequest,
    onRequestError: handleQuotaApiError,
    onStreamComplete: async () => {
      const handler = streamCompleteHandlerRef.current;
      if (handler) {
        await handler();
      }
    },
  });

  const sendMessage = useCallback(async (text: string) => {
    if (delegationMode) return; // Delegation chats are read-only
    if (isQuotaExceeded) {
      checkQuotaBeforeRequest();
      return;
    }
    await sse.send({
      text,
      history: messages,
      openTabs: openTabsData,
      activeTabId,
      sessionId,
      mode: chatMode
    });
  }, [activeTabId, chatMode, checkQuotaBeforeRequest, delegationMode, isQuotaExceeded, messages, openTabsData, sse, sessionId]);

  const handleStreamComplete = useCallback(async () => {
    await refetchUsage();
  }, [refetchUsage]);

  useEffect(() => {
    streamCompleteHandlerRef.current = handleStreamComplete;
  }, [handleStreamComplete]);

  useEffect(() => {
    setMessagesRef.current = setMessages;
  }, [setMessages]);

  const focusSummary = useMemo(() => {
    if (!openTabsData.length) return null;
    const titles = openTabsData.map((node) => node?.title || 'Untitled');
    const activeNode = openTabsData.find((node) => node.id === activeTabId) || openTabsData[0];
    const truncate = (value: string, limit = 64) => {
      if (value.length <= limit) return value;
      return `${value.slice(0, limit - 1)}…`;
    };
    return {
      id: activeNode?.id ?? null,
      title: truncate(activeNode?.title || 'Untitled'),
      total: titles.length,
    };
  }, [openTabsData, activeTabId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleNewChat = () => {
    if (delegationMode) return;
    sse.abort();
    setMessages((_prev) => []);
    setSessionId(createSessionId());
  };

  // Subscribe to delegation stream if in delegation mode
  useEffect(() => {
    if (!delegationMode || !delegationSessionId) return;

    const eventSource = new EventSource(`/api/rah/delegations/stream?sessionId=${delegationSessionId}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'text-delta' && data.delta) {
          setMessagesRef.current((prev) => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.role === MessageRole.ASSISTANT) {
              const updated = [...prev];
              updated[updated.length - 1] = { ...lastMsg, content: lastMsg.content + data.delta };
              return updated;
            }
            return [...prev, {
              id: crypto.randomUUID(),
              role: MessageRole.ASSISTANT,
              content: data.delta,
              timestamp: new Date()
            }];
          });
        }

        if (data.type === 'tool-input-start' || data.type === 'tool-call') {
          const toolMessage: ChatMessage = {
            id: `tool-${data.toolCallId || crypto.randomUUID()}`,
            role: MessageRole.TOOL,
            content: data.toolName,
            timestamp: new Date(),
            toolName: data.toolName,
            status: (data.status as ChatMessage['status']) || 'running',
            toolArgs: data.input ?? data.args ?? data.parameters
          };
          setMessagesRef.current((prev) => [...prev, toolMessage]);
        }

        if (data.type === 'tool-output-available' || data.type === 'tool-result') {
          setMessagesRef.current((prev) =>
            prev.map((m) =>
              m.id === `tool-${data.toolCallId}`
                ? {
                    ...m,
                    content: `${m.toolName} ${data.status === 'error' ? '✗' : '✓'}`,
                    status: (data.status as ChatMessage['status']) || (data.error ? 'error' : 'complete'),
                    toolResult: data.result ?? data.output ?? (data.summary ? { summary: data.summary } : undefined),
                  }
                : m
            )
          );
        }

        if (data.type === 'assistant-message') {
          setMessagesRef.current((prev) => [...prev, {
            id: crypto.randomUUID(),
            role: MessageRole.ASSISTANT,
            content: '',
            timestamp: new Date()
          }]);
        }
      } catch (error) {
        console.error('[RAHChat] Failed to parse delegation stream event:', error);
      }
    };

    eventSource.onerror = () => {
      console.error('[RAHChat] Delegation stream connection error');
    };

    return () => {
      eventSource.close();
    };
  }, [delegationMode, delegationSessionId]);

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: '#0a0a0a'
    }}>
      {focusSummary && (
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid #1a1a1a',
          background: '#0a0a0a'
        }}>
          {/* Focused node info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
            <span style={{
              color: '#22c55e',
              fontSize: '10px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase'
            }}>
              Focused Node ({focusSummary.total})
            </span>
            <span style={{ color: '#d0d0d0', fontSize: '10px' }}>#{focusSummary.id}</span>
            <span
              style={{
                color: '#f3f3f3',
                fontSize: '12px',
                fontWeight: 600,
                flex: 1,
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
              title={focusSummary.title}
            >
              {focusSummary.title}
            </span>
          </div>
          <DelegationIndicator delegations={delegations} />
        </header>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '16px', background: '#0a0a0a' }}>
        {messages.length === 0 ? (
          <AsciiBanner helperName="ra-h" displayName={helperDisplayName} />
        ) : (
          <>
            {messages.map((message) => (
              <TerminalMessage
                key={message.id}
                role={message.role}
                content={message.content}
                timestamp={message.timestamp}
                toolName={message.toolName}
                status={message.status}
                toolArgs={message.toolArgs}
                toolResult={message.toolResult}
                onNodeClick={onNodeClick}
              />
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {!delegationMode && (
        <div style={{
          padding: '0 16px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {(quotaError || isQuotaExceeded) && (
            <div style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.35)',
              color: '#fca5a5',
              fontSize: '11px',
              padding: '10px 12px',
              borderRadius: '6px',
              lineHeight: 1.4
            }}>
              {quotaError?.message ?? 'Rate limit reached. Please wait a moment and try again.'}
            </div>
          )}
          <TerminalInput
            onSubmit={sendMessage}
            isProcessing={sse.isLoading || isQuotaExceeded}
            placeholder={`ask ${helperDisplayName}...`}
            helperId={activeTabId ?? undefined}
          />
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <ModelSelector chatMode={chatMode} />
            </div>
            <button
              onClick={handleNewChat}
              style={{
                background: 'none',
                border: 'none',
                color: '#fff',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '4px 8px',
                transition: 'color 0.2s',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#d0d0d0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#fff';
              }}
            >
              <span style={{ 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: '#fff',
                color: '#0a0a0a',
                fontSize: '12px',
                lineHeight: 1,
                fontWeight: 300,
                flexShrink: 0
              }}>+</span>
              New Chat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ModelSelectorProps {
  chatMode: 'easy' | 'hard';
}

function ModelSelector({ chatMode }: ModelSelectorProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  const currentModel = chatMode === 'easy' ? 'Easy (GPT)' : 'Hard (Claude)';
  const Icon = chatMode === 'easy' ? Zap : Flame;
  const activeColor = chatMode === 'easy' ? '#22c55e' : '#f97316';

  const options = [
    { id: 'easy', label: 'Easy (GPT)', icon: Zap, color: '#22c55e' },
    { id: 'hard', label: 'Hard (Claude)', icon: Flame, color: '#f97316' },
    { id: 'soon', label: 'Ra-h (Soon)', icon: null, color: '#666', disabled: true }
  ];

  return (
    <div style={{ position: 'relative' }}>
      <button 
        onClick={() => setDropdownOpen(!dropdownOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 12px',
          border: '1px solid #1a1a1a',
          borderRadius: '6px',
          background: '#0f0f0f',
          color: '#e5e5e5',
          fontSize: '12px',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#333';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#1a1a1a';
        }}
      >
        <Icon size={12} strokeWidth={2.4} color={activeColor} />
        {currentModel}
        <span style={{ 
          marginLeft: '4px', 
          transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s'
        }}>▲</span>
      </button>
      
      {dropdownOpen && (
        <div style={{
          position: 'absolute',
          bottom: '100%', /* Open upward */
          left: '0',
          marginBottom: '4px',
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '6px',
          minWidth: '150px',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)'
        }}>
          {options.map((option) => {
            const OptionIcon = option.icon;
            const isActive = (option.id === 'easy' && chatMode === 'easy') || (option.id === 'hard' && chatMode === 'hard');
            
            return (
              <button
                key={option.id}
                onClick={() => {
                  if (!option.disabled && !isActive) {
                    window.dispatchEvent(new CustomEvent('rah:mode-toggle', { detail: { mode: option.id as 'easy' | 'hard' } }));
                  }
                  setDropdownOpen(false);
                }}
                disabled={option.disabled}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  border: 'none',
                  background: isActive ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
                  color: option.disabled ? '#666' : (isActive ? '#22c55e' : '#e5e5e5'),
                  fontSize: '12px',
                  cursor: option.disabled ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  borderRadius: '4px'
                }}
                onMouseEnter={(e) => {
                  if (!option.disabled && !isActive) {
                    e.currentTarget.style.background = '#0a0a0a';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!option.disabled && !isActive) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                {OptionIcon && <OptionIcon size={12} strokeWidth={2} color={option.color} />}
                {!OptionIcon && <div style={{ width: '12px' }} />} {/* Spacer for alignment */}
                {option.label}
                {isActive && <span style={{ marginLeft: 'auto', color: '#22c55e' }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
