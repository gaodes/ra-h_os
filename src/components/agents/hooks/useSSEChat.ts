"use client";

import { useRef, useState } from 'react';

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  TOOL = 'tool',
  SYSTEM = 'system',
  THINKING = 'thinking',
}

export interface ChatMessage {
  id: string;
  role: MessageRole.USER | MessageRole.ASSISTANT | MessageRole.TOOL | MessageRole.SYSTEM | MessageRole.THINKING;
  content: string;
  timestamp: Date;
  toolName?: string;
  status?: 'processing' | 'delivered' | 'error' | 'starting' | 'running' | 'complete';
  toolArgs?: any;
  toolResult?: any;
}

interface SendParams {
  text: string;
  history: ChatMessage[];
  openTabs: any[];
  activeTabId: number | null;
  currentView?: 'nodes' | 'memory';
  sessionId: string;
  mode: 'easy' | 'hard';
}

interface UseSSEChatOptions {
  getAuthToken?: () => string | null | undefined;
  beforeRequest?: () => boolean;
  onRequestError?: (error: unknown, response?: Response) => boolean | void;
  onStreamComplete?: () => void | Promise<void>;
  getApiKeys?: () => { openai?: string; anthropic?: string } | undefined;
}

export function useSSEChat(
  endpoint: string,
  setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void,
  options: UseSSEChatOptions = {}
) {
  const { getAuthToken, beforeRequest, onRequestError, onStreamComplete, getApiKeys } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const abort = () => {
    abortControllerRef.current?.abort();
  };

  const send = async ({ text, history, openTabs, activeTabId, currentView, sessionId, mode }: SendParams) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    if (beforeRequest && !beforeRequest()) return;

    setIsLoading(true);
    setError(null);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: MessageRole.USER,
      content: trimmed,
      timestamp: new Date()
    };
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: MessageRole.ASSISTANT,
      content: '',
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    let handledError = false;
    let currentAssistantMessage = assistantMessage;

    try {
      abortControllerRef.current = new AbortController();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = getAuthToken?.();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: history
            .concat(userMessage)
            .filter((m) => [MessageRole.USER, MessageRole.ASSISTANT, MessageRole.SYSTEM].includes(m.role))
            .map((m) => ({ role: m.role, parts: [{ type: 'text', text: m.content }] })),
          openTabs,
          activeTabId,
          currentView,
          sessionId,
          mode,
          apiKeys: getApiKeys?.(),
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`);
        handledError = Boolean(onRequestError?.(error, response));
        setMessages((prev) =>
          prev.filter((m) => !(m.id === currentAssistantMessage.id && m.content === ''))
        );
        if (handledError) {
          return;
        }
        throw error;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No response body');

      let fullContent = '';
      let toolCallsActive: Record<string, string> = {};
      let hasToolCalls = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.substring(6));

            if (data.type === 'text-delta' && data.delta) {
              fullContent += data.delta;
              setMessages((prev) => prev.map((m) => (m.id === currentAssistantMessage.id ? { ...m, content: fullContent } : m)));
            }

            if (data.type === 'tool-input-start') {
              hasToolCalls = true;
              toolCallsActive[data.toolCallId] = data.toolName;
              const toolMessage: ChatMessage = {
                id: `tool-${data.toolCallId}`,
                role: MessageRole.TOOL,
                content: data.toolName,
                timestamp: new Date(),
                toolName: data.toolName,
                status: 'running',
                toolArgs: (data.args ?? data.input ?? data.parameters ?? null)
              };
              setMessages((prev) => {
                const filtered = prev.filter((m) => m.id !== toolMessage.id);
                const index = filtered.findIndex((m) => m.id === currentAssistantMessage.id);
                return [...filtered.slice(0, index), toolMessage, ...filtered.slice(index)];
              });
            }

            if (data.type === 'tool-output-available') {
              delete toolCallsActive[data.toolCallId];
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === `tool-${data.toolCallId}`
                    ? { ...m, content: `${m.toolName} ✓`, status: 'complete', toolResult: (data.result ?? data.output ?? null) }
                    : m
                )
              );

              if (Object.keys(toolCallsActive).length === 0 && hasToolCalls) {
                const newAssistantMessage: ChatMessage = {
                  id: crypto.randomUUID(),
                  role: MessageRole.ASSISTANT,
                  content: '',
                  timestamp: new Date()
                };
                currentAssistantMessage = newAssistantMessage;
                fullContent = '';
                setMessages((prev) => [...prev, newAssistantMessage]);
              }
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
      if (onStreamComplete) {
        await onStreamComplete();
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        if (!handledError) {
          handledError = Boolean(onRequestError?.(err));
        }
        if (!handledError) {
          setError(err?.message || 'Failed to send message');
        }
        setMessages((prev) =>
          prev.filter((m) => !(m.id === currentAssistantMessage.id && m.content === ''))
        );
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  return { isLoading, error, send, abort };
}
