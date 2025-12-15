/**
 * Terminal Theme Constants for ra-h
 * Centralized styling for terminal-inspired UI elements
 */

import { CSSProperties } from 'react';

// Terminal Color Palette
export const TERMINAL_COLORS = {
  // Message indicators (Claude Code style)
  user: '#3b82f6',      // Blue dot for user messages
  assistant: '#10b981',  // Green dot for assistant messages  
  tool: '#f59e0b',      // Orange dot for tool use
  processing: '#eab308', // Yellow dot for thinking/processing states
  
  // Terminal elements
  prompt: '#10b981',    // Terminal green for $ prompt
  accent: '#10b981',    // Primary terminal accent color
  
  // Base colors (terminal-inspired palette)
  bg: {
    primary: '#000',     // Main background
    secondary: '#000',   // Secondary background (input area) - same as primary
    elevated: '#000',    // Elevated surfaces (message bubbles) - same as primary for borderless look
  },
  
  text: {
    primary: '#d1d5db',  // Primary text
    secondary: '#666',   // Muted text
    tertiary: '#444',    // Very muted text
  },
  
  border: {
    primary: '#333',     // Primary borders
    secondary: '#222',   // Subtle borders
  }
} as const;

// Terminal Typography
export const TERMINAL_FONTS = {
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  system: 'inherit'
} as const;

// Terminal Component Styles
export const TERMINAL_STYLES = {
  // Message header with colored dot indicator
  messageHeader: (role: 'user' | 'assistant' | 'tool'): CSSProperties => ({
    fontSize: '10px',
    color: TERMINAL_COLORS.text.secondary,
    marginBottom: '4px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: TERMINAL_FONTS.mono
  }),

  // Colored dot indicator
  messageIndicator: (role: 'user' | 'assistant' | 'tool' | 'processing'): CSSProperties => ({
    fontSize: '8px',
    color: TERMINAL_COLORS[role],
    width: '6px',
    height: '6px',
    flexShrink: 0
  }),

  // Message bubble (borderless for cleaner terminal feel)
  messageBubble: (role: 'user' | 'assistant'): CSSProperties => ({
    background: role === 'user' ? TERMINAL_COLORS.bg.elevated : TERMINAL_COLORS.bg.secondary,
    border: 'none', // Removed borders for cleaner terminal look
    borderRadius: '0px', // Sharp terminal corners
    padding: '12px 16px',
    maxWidth: '80%',
    fontSize: '13px',
    lineHeight: '1.5',
    color: TERMINAL_COLORS.text.primary,
    whiteSpace: 'pre-wrap' as const,
    fontFamily: TERMINAL_FONTS.mono
  }),

  // Message timestamp
  messageTimestamp: (): CSSProperties => ({
    fontSize: '9px',
    color: TERMINAL_COLORS.text.tertiary,
    marginTop: '6px',
    fontFamily: TERMINAL_FONTS.mono
  }),

  // Terminal input container
  terminalInputContainer: (): CSSProperties => ({
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    flex: 1
  }),

  // Terminal prompt symbol
  terminalPrompt: (): CSSProperties => ({
    position: 'absolute' as const,
    left: '12px',
    color: TERMINAL_COLORS.prompt,
    fontSize: '13px',
    fontFamily: TERMINAL_FONTS.mono,
    zIndex: 1,
    pointerEvents: 'none' as const
  }),

  // Terminal input field (subtle border, auto-expanding)
  terminalInput: (): CSSProperties => ({
    width: '100%',
    background: TERMINAL_COLORS.bg.elevated,
    border: `1px solid ${TERMINAL_COLORS.border.secondary}`, // More subtle border
    borderRadius: '4px',
    padding: '8px 12px 8px 24px', // Extra left padding for $ symbol
    fontSize: '13px',
    color: TERMINAL_COLORS.text.primary,
    fontFamily: TERMINAL_FONTS.mono,
    resize: 'none' as const,
    minHeight: '36px',
    maxHeight: '120px', // Increased max height
    outline: 'none',
    transition: 'border-color 0.2s, height 0.1s ease',
    overflow: 'hidden' // For auto-resize
  }),

  // Terminal send button
  terminalButton: (disabled: boolean = false): CSSProperties => ({
    padding: '8px 16px',
    background: disabled ? TERMINAL_COLORS.border.primary : TERMINAL_COLORS.accent,
    color: disabled ? TERMINAL_COLORS.text.secondary : '#fff',
    border: `1px solid ${TERMINAL_COLORS.border.primary}`,
    borderRadius: '4px',
    fontSize: '13px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: TERMINAL_FONTS.mono,
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  }),

  // Chat messages container
  messagesContainer: (): CSSProperties => ({
    flex: 1,
    overflow: 'auto',
    padding: '16px',
    fontFamily: TERMINAL_FONTS.mono
  }),

  // Thinking indicator
  thinkingIndicator: (): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    background: TERMINAL_COLORS.bg.secondary,
    borderRadius: '0px',
    margin: '8px 0',
    fontSize: '12px',
    color: TERMINAL_COLORS.text.secondary,
    fontFamily: TERMINAL_FONTS.mono,
    fontStyle: 'italic'
  }),

  // Tool use indicator (separate from messages)
  toolIndicator: (): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: 'rgba(245, 158, 11, 0.1)', // Orange background with transparency
    border: `1px solid ${TERMINAL_COLORS.tool}`,
    borderRadius: '0px',
    margin: '4px 0',
    fontSize: '11px',
    color: TERMINAL_COLORS.tool,
    fontFamily: TERMINAL_FONTS.mono
  }),

  // Input form container (remove border)
  inputForm: (): CSSProperties => ({
    borderTop: 'none', // Remove border between chat and input
    padding: '16px',
    background: TERMINAL_COLORS.bg.primary // Same as main background for seamless look
  })
} as const;

// Terminal Tool Indicators
export const TERMINAL_TOOLS = {
  processing: '⟡ Processing...',
  generating: '▸ Generating response...',
  thinking: (displayName: string) => `${displayName} is thinking...`,
  toolPrefix: '⟩',
  thinkingDots: '⋯'
} as const;

// Terminal Animations (for use in CSS)
export const TERMINAL_ANIMATIONS = {
  pulse: 'pulse 1.5s ease-in-out infinite',
  typing: 'typing 1s ease-in-out infinite'
} as const;

// Helper function to get role-based styling
export const getMessageStyles = (role: 'user' | 'assistant', isLoading?: boolean) => ({
  header: TERMINAL_STYLES.messageHeader(role),
  indicator: TERMINAL_STYLES.messageIndicator(isLoading ? 'processing' : role),
  bubble: TERMINAL_STYLES.messageBubble(role),
  timestamp: TERMINAL_STYLES.messageTimestamp()
});

// Helper function to get input styling with focus states
export const getTerminalInputStyles = (isFocused: boolean = false) => ({
  container: TERMINAL_STYLES.terminalInputContainer(),
  prompt: TERMINAL_STYLES.terminalPrompt(),
  input: {
    ...TERMINAL_STYLES.terminalInput(),
    borderColor: isFocused ? TERMINAL_COLORS.accent : TERMINAL_COLORS.border.secondary
  }
});

// Auto-resize textarea helper function
export const autoResizeTextarea = (textarea: HTMLTextAreaElement) => {
  textarea.style.height = 'auto';
  const newHeight = Math.min(textarea.scrollHeight, 120); // Max 120px
  textarea.style.height = `${Math.max(newHeight, 36)}px`; // Min 36px
};

// Thinking indicator component props
export const getThinkingIndicator = (displayName: string, isVisible: boolean) => {
  if (!isVisible) return null;
  
  return {
    style: TERMINAL_STYLES.thinkingIndicator(),
    content: TERMINAL_TOOLS.thinking(displayName),
    dots: TERMINAL_TOOLS.thinkingDots
  };
};

// Tool use indicator component props  
export const getToolIndicator = (toolName: string, isActive: boolean) => {
  if (!isActive) return null;
  
  return {
    style: TERMINAL_STYLES.toolIndicator(),
    content: `${TERMINAL_TOOLS.toolPrefix} ${toolName}`,
    isActive
  };
};