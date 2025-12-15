import { useCallback, useReducer } from 'react';

export type VoiceSessionStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface VoiceTranscriptSegment {
  id: string;
  text: string;
  createdAt: number;
}

interface VoiceSessionState {
  isActive: boolean;
  status: VoiceSessionStatus;
  interimTranscript: string;
  segments: VoiceTranscriptSegment[];
  amplitude: number;
  startedAt: number | null;
}

type VoiceSessionAction =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'set-status'; status: VoiceSessionStatus }
  | { type: 'set-amplitude'; amplitude: number }
  | { type: 'set-interim'; transcript: string }
  | { type: 'append-segment'; text: string }
  | { type: 'replace-segments'; segments: VoiceTranscriptSegment[] }
  | { type: 'reset-transcript' };

const initialState: VoiceSessionState = {
  isActive: false,
  status: 'idle',
  interimTranscript: '',
  segments: [],
  amplitude: 0,
  startedAt: null,
};

function reducer(state: VoiceSessionState, action: VoiceSessionAction): VoiceSessionState {
  switch (action.type) {
    case 'start':
      return {
        ...state,
        isActive: true,
        status: 'listening',
        interimTranscript: '',
        segments: [],
        amplitude: 0,
        startedAt: Date.now(),
      };
    case 'stop':
      return {
        ...state,
        isActive: false,
        status: 'idle',
        amplitude: 0,
        interimTranscript: '',
        startedAt: null,
      };
    case 'set-status':
      return {
        ...state,
        status: action.status,
      };
    case 'set-amplitude':
      return {
        ...state,
        amplitude: Math.max(0, Math.min(1, action.amplitude)),
      };
    case 'set-interim':
      return {
        ...state,
        interimTranscript: action.transcript,
      };
    case 'append-segment': {
      const trimmed = action.text.trim();
      if (!trimmed) return state;
      const segment: VoiceTranscriptSegment = {
        id: `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: trimmed,
        createdAt: Date.now(),
      };
      return {
        ...state,
        segments: [...state.segments, segment],
      };
    }
    case 'replace-segments':
      return {
        ...state,
        segments: action.segments,
      };
    case 'reset-transcript':
      return {
        ...state,
        interimTranscript: '',
        segments: [],
      };
    default:
      return state;
  }
}

export function useVoiceSession() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const startSession = useCallback(() => {
    dispatch({ type: 'start' });
  }, []);

  const stopSession = useCallback(() => {
    dispatch({ type: 'stop' });
  }, []);

  const setStatus = useCallback((status: VoiceSessionStatus) => {
    dispatch({ type: 'set-status', status });
  }, []);

  const setAmplitude = useCallback((amplitude: number) => {
    dispatch({ type: 'set-amplitude', amplitude });
  }, []);

  const setInterimTranscript = useCallback((transcript: string) => {
    dispatch({ type: 'set-interim', transcript });
  }, []);

  const appendFinalTranscript = useCallback((text: string) => {
    dispatch({ type: 'append-segment', text });
  }, []);

  const resetTranscript = useCallback(() => {
    dispatch({ type: 'reset-transcript' });
  }, []);

  const replaceSegments = useCallback((segments: VoiceTranscriptSegment[]) => {
    dispatch({ type: 'replace-segments', segments });
  }, []);

  return {
    ...state,
    startSession,
    stopSession,
    setStatus,
    setAmplitude,
    setInterimTranscript,
    appendFinalTranscript,
    resetTranscript,
    replaceSegments,
  } as const;
}
