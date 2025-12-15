"use client";

import { useCallback, useEffect, useRef } from 'react';

export type RealtimeConnectionState = 'idle' | 'connecting' | 'ready' | 'capturing';

interface VoiceRealtimeCallbacks {
  onStatusChange?: (status: 'idle' | 'listening' | 'thinking' | 'speaking') => void;
  onInterimTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onAmplitude?: (value: number) => void;
  onError?: (error: Error) => void;
}

interface UseRealtimeVoiceClientOptions {
  getAuthToken?: () => string | null | undefined;
  fetchEphemeralToken?: (
    authToken: string | null
  ) => Promise<{ client_secret: { value: string }; model: string; voice: string }>;
  silenceThresholdMs?: number;
  silenceAmplitudeCutoff?: number;
}

const DEFAULT_SILENCE_THRESHOLD_MS = 800;
const DEFAULT_SILENCE_AMPLITUDE = 0.0015;

type Nullable<T> = T | null;

function calculateRms(buffer: Float32Array) {
  if (!buffer.length) return 0;
  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const value = buffer[i];
    sumSquares += value * value;
  }
  return Math.sqrt(sumSquares / buffer.length);
}


export function useRealtimeVoiceClient(
  callbacks: VoiceRealtimeCallbacks,
  options: UseRealtimeVoiceClientOptions = {}
) {
  const { onStatusChange, onInterimTranscript, onFinalTranscript, onAmplitude, onError } = callbacks;

  const { getAuthToken, fetchEphemeralToken, silenceThresholdMs, silenceAmplitudeCutoff } = options;

  const connectionStateRef = useRef<RealtimeConnectionState>('idle');
  const peerConnectionRef = useRef<Nullable<RTCPeerConnection>>(null);
  const dataChannelRef = useRef<Nullable<RTCDataChannel>>(null);
  const audioContextRef = useRef<Nullable<AudioContext>>(null);
  const processorNodeRef = useRef<Nullable<ScriptProcessorNode>>(null);
  const mediaStreamRef = useRef<Nullable<MediaStream>>(null);
  const mediaSourceRef = useRef<Nullable<MediaStreamAudioSourceNode>>(null);
  const awaitingTranscriptRef = useRef(false);
  const hasUncommittedAudioRef = useRef(false);
  const lastSpeechAtRef = useRef<number | null>(null);
  const destroyedRef = useRef(false);
  const channelReadyRef = useRef(false);

  const silenceWindowMs = silenceThresholdMs ?? DEFAULT_SILENCE_THRESHOLD_MS;
  const amplitudeGate = silenceAmplitudeCutoff ?? DEFAULT_SILENCE_AMPLITUDE;

  const onStatusChangeRef = useRef(onStatusChange);
  const onInterimTranscriptRef = useRef(onInterimTranscript);
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  const onAmplitudeRef = useRef(onAmplitude);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    onInterimTranscriptRef.current = onInterimTranscript;
  }, [onInterimTranscript]);

  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    onAmplitudeRef.current = onAmplitude;
  }, [onAmplitude]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const setConnectionState = useCallback((next: RealtimeConnectionState) => {
    connectionStateRef.current = next;
  }, []);

  const teardownInputNodes = useCallback(() => {
    processorNodeRef.current?.disconnect();
    mediaSourceRef.current?.disconnect();
    processorNodeRef.current?.removeEventListener('audioprocess', () => undefined);
    processorNodeRef.current = null;
    mediaSourceRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const closePeerConnection = useCallback(() => {
    if (dataChannelRef.current) {
      try {
        dataChannelRef.current.close();
      } catch (err) {
        console.warn('[VoiceRealtime] Failed to close data channel:', err);
      }
    }
    dataChannelRef.current = null;

    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onconnectionstatechange = null;
        peerConnectionRef.current.close();
      } catch (err) {
        console.warn('[VoiceRealtime] Failed to close peer connection:', err);
      }
    }
    peerConnectionRef.current = null;

    channelReadyPromiseRef.current = null;
    channelReadyResolveRef.current = null;
  }, []);

  const resetState = useCallback(() => {
    awaitingTranscriptRef.current = false;
    hasUncommittedAudioRef.current = false;
    lastSpeechAtRef.current = null;
    channelReadyPromiseRef.current = null;
    channelReadyResolveRef.current = null;
  }, []);

  const notifyError = useCallback((message: string | Error) => {
    const error = message instanceof Error ? message : new Error(message);
    onErrorRef.current?.(error);
  }, []);

  const channelReadyPromiseRef = useRef<Promise<void> | null>(null);
  const channelReadyResolveRef = useRef<(() => void) | null>(null);

  const ensureChannelReady = useCallback(async () => {
    const channel = dataChannelRef.current;
    if (channel?.readyState === 'open') return;
    if (!channelReadyPromiseRef.current) {
      channelReadyPromiseRef.current = new Promise<void>((resolve) => {
        channelReadyResolveRef.current = resolve;
      });
    }
    await channelReadyPromiseRef.current;
  }, []);

  const sendEvent = useCallback(
    async (event: Record<string, unknown>) => {
      await ensureChannelReady();
      const channel = dataChannelRef.current;
      if (!channel || channel.readyState !== 'open') {
        throw new Error('Realtime data channel is not open');
      }
      channel.send(JSON.stringify(event));
    },
    [ensureChannelReady]
  );

  const initialiseMicrophone = useCallback(async () => {
    if (typeof window === 'undefined') {
      throw new Error('Voice not supported in this environment');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: false,
      },
    });

    if (destroyedRef.current) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (err) {
          console.warn('[VoiceRealtime] Failed to stop track after destroy', err);
        }
      });
      return stream;
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(2048, 1, 1);

      processor.onaudioprocess = (event) => {
        if (destroyedRef.current) return;
        const inputBuffer = event.inputBuffer.getChannelData(0);
        const amplitude = calculateRms(inputBuffer);
        onAmplitudeRef.current?.(Math.min(1, amplitude * 8));

        const now = Date.now();
        const channelReady = channelReadyRef.current;
        if (amplitude > amplitudeGate && channelReady) {
          hasUncommittedAudioRef.current = true;
          lastSpeechAtRef.current = now;
          if (!awaitingTranscriptRef.current) {
            onStatusChangeRef.current?.('listening');
          }
        } else if (
          channelReady &&
          hasUncommittedAudioRef.current &&
          !awaitingTranscriptRef.current &&
          lastSpeechAtRef.current &&
          now - lastSpeechAtRef.current > silenceWindowMs
        ) {
          awaitingTranscriptRef.current = true;
          hasUncommittedAudioRef.current = false;
          lastSpeechAtRef.current = null;
          onStatusChangeRef.current?.('thinking');
        }
      };

    source.connect(processor);
    processor.connect(audioContext.destination);

    audioContextRef.current = audioContext;
    processorNodeRef.current = processor;
    mediaSourceRef.current = source;
    mediaStreamRef.current = stream;
    return stream;
  }, [amplitudeGate, silenceWindowMs]);

  const disconnect = useCallback(() => {
    destroyedRef.current = true;
    teardownInputNodes();
    closePeerConnection();
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    resetState();
    channelReadyRef.current = false;
    setConnectionState('idle');
    onStatusChangeRef.current?.('idle');
    onAmplitudeRef.current?.(0);
  }, [closePeerConnection, resetState, setConnectionState, teardownInputNodes]);

  const extractTextDelta = useCallback((payload: unknown): string => {
    if (!payload) return '';
    if (typeof payload === 'string') return payload;
    if (typeof payload !== 'object') return '';

    const record = payload as Record<string, unknown>;
    if (typeof record.delta === 'string') return record.delta;
    if (typeof record.text === 'string') return record.text;

    const outputText = record.output_text as Record<string, unknown> | undefined;
    if (typeof outputText?.text === 'string') return outputText.text;

    if (Array.isArray(record.output)) {
      return record.output
        .flatMap((item) =>
          Array.isArray((item as Record<string, unknown>)?.content)
            ? ((item as Record<string, unknown>).content as unknown[])
            : []
        )
        .map((content) => {
          if (!content || typeof content !== 'object') return '';
          const entry = content as Record<string, unknown>;
          const nestedText = entry.text as Record<string, unknown> | string | undefined;
          if (typeof nestedText === 'string') return nestedText;
          if (typeof nestedText === 'object' && nestedText !== null && typeof nestedText.value === 'string') {
            return nestedText.value;
          }
          return '';
        })
        .filter(Boolean)
        .join('');
    }

    if (Array.isArray(record.content)) {
      return record.content
        .map((content) => {
          if (!content || typeof content !== 'object') return '';
          const entry = content as Record<string, unknown>;
          const nestedText = entry.text as Record<string, unknown> | string | undefined;
          if (typeof nestedText === 'string') return nestedText;
          if (typeof nestedText === 'object' && nestedText !== null && typeof nestedText.value === 'string') {
            return nestedText.value;
          }
          return '';
        })
        .filter(Boolean)
        .join('');
    }

    return '';
  }, []);

  const handleDataMessage = useCallback(
    (raw: string) => {
      try {
        const data = JSON.parse(raw);
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[VoiceRealtime] Event', data.type, data);
        }

        if (data.type === 'conversation.item.input_audio_transcription.completed') {
          const transcriptSource =
            typeof data.transcript === 'string'
              ? data.transcript
              : extractTextDelta(data.item ?? data.content ?? data);
          const transcript = transcriptSource?.trim();
          awaitingTranscriptRef.current = false;
          hasUncommittedAudioRef.current = false;
          lastSpeechAtRef.current = null;
          if (transcript) {
            console.info('[VoiceRealtime] Transcript completed', transcript);
            onInterimTranscriptRef.current?.('');
            onFinalTranscriptRef.current?.(transcript);
          } else {
            console.warn('[VoiceRealtime] Received empty transcription event');
            onInterimTranscriptRef.current?.('');
          }
          onStatusChangeRef.current?.('listening');
          return;
        }

        if (data.type === 'error' && data.error) {
          console.error('[VoiceRealtime] Server error', data.error);
        }

        if (data.type === 'response.error' && data.error) {
          console.error('[VoiceRealtime] Response error', data.error);
        }
      } catch (err) {
        notifyError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [extractTextDelta, notifyError]
  );

  const waitForIceGatheringComplete = useCallback((pc: RTCPeerConnection, timeoutMs = 2000) => {
    if (pc.iceGatheringState === 'complete') {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      let resolved = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      const finish = () => {
        if (resolved) return;
        resolved = true;
        pc.removeEventListener('icegatheringstatechange', handleStateChange);
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
        resolve();
      };

      const handleStateChange = () => {
        if (pc.iceGatheringState === 'complete') {
          finish();
        }
      };

      if (timeoutMs) {
        timeoutHandle = setTimeout(() => {
          console.warn('[VoiceRealtime] ICE gathering timeout reached, proceeding with partial candidates');
          finish();
        }, timeoutMs);
      }

      pc.addEventListener('icegatheringstatechange', handleStateChange);
    });
  }, []);

  const start = useCallback(async () => {
    try {
      destroyedRef.current = false;
      resetState();
      setConnectionState('connecting');

      const authToken = getAuthToken?.() ?? null;
      const fetchToken = fetchEphemeralToken
        ? fetchEphemeralToken
        : async (token: string | null) => {
            const response = await fetch('/api/realtime/ephemeral-token', {
              method: 'POST',
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            });
            if (!response.ok) {
              const payload = await response.json().catch(() => ({}));
              throw new Error(payload.error || `Failed to mint ephemeral token (${response.status})`);
            }
            return response.json();
          };

      const sessionPromise = fetchToken(authToken);
      const microphonePromise = initialiseMicrophone();

      const session = await sessionPromise;
      const clientSecret = session?.client_secret?.value || session?.client_secret;
      if (!clientSecret || typeof clientSecret !== 'string') {
        throw new Error('Realtime session did not include a client_secret');
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
      });
      peerConnectionRef.current = pc;

      const channel = pc.createDataChannel('oai-events');
      dataChannelRef.current = channel;
      channelReadyPromiseRef.current = new Promise<void>((resolve) => {
        channelReadyResolveRef.current = resolve;
      });
      channelReadyRef.current = false;

      channel.onmessage = (event) => {
        handleDataMessage(event.data);
      };

      channel.onopen = () => {
        console.info('[VoiceRealtime] Data channel open');
        setConnectionState('ready');
        channelReadyResolveRef.current?.();
        channelReadyResolveRef.current = null;
        channelReadyRef.current = true;

        void sendEvent({
          type: 'session.update',
          session: {
            modalities: ['text'],
            input_audio_transcription: {
              model: 'whisper-1',
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              silence_duration_ms: 1800,
              prefix_padding_ms: 300,
              create_response: false,
            },
            instructions: 'You are the RA-H voice transport. Only transcribe user speech accurately, never speak responses.',
          },
        }).catch((err) => {
          console.error('[VoiceRealtime] Failed to send session update:', err);
        });
      };

      channel.onerror = (event) => {
        console.error('[VoiceRealtime] Data channel error:', event);
        notifyError(new Error('Realtime connection error'));
        channelReadyRef.current = false;
        disconnect();
      };

      channel.onclose = () => {
        console.warn('[VoiceRealtime] Data channel closed');
        channelReadyPromiseRef.current = null;
        channelReadyResolveRef.current = null;
        channelReadyRef.current = false;
        if (!destroyedRef.current) {
          notifyError(new Error('Realtime data channel closed unexpectedly'));
          disconnect();
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.info('[VoiceRealtime] Peer connection state:', state);
        if (state === 'connected') {
          onStatusChangeRef.current?.('listening');
          setConnectionState('capturing');
        }
        if (state === 'failed' || state === 'closed' || state === 'disconnected') {
          if (!destroyedRef.current) {
            notifyError(new Error(`Realtime connection ${state}`));
          }
          disconnect();
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.info('[VoiceRealtime] ICE connection state:', pc.iceConnectionState);
      };

      pc.ontrack = () => undefined;

      const mediaStream = await microphonePromise;
      mediaStream?.getAudioTracks().forEach((track) => {
        if (peerConnectionRef.current?.signalingState !== 'closed') {
          peerConnectionRef.current?.addTrack(track, mediaStream);
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc, 2000);

      const localDescription = pc.localDescription;
      if (!localDescription) {
        throw new Error('Failed to create local description for realtime call');
      }

      const response = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          'Content-Type': 'application/sdp',
          'OpenAI-Beta': 'realtime=v1',
        },
        body: localDescription.sdp,
      });

      if (!response.ok) {
        let errorDetail = '';
        try {
          const text = await response.text();
          errorDetail = text;
          const maybeJson = text ? JSON.parse(text) : null;
          if (maybeJson?.error?.message) {
            errorDetail = maybeJson.error.message;
          }
        } catch {
          // ignore JSON parse errors and fall back to raw text
        }
        const friendly = errorDetail || response.statusText || 'Unknown realtime error';
        console.error('[VoiceRealtime] Failed to start realtime call:', friendly, { status: response.status });
        throw new Error(`Failed to establish realtime call (${response.status}): ${friendly}`);
      }

      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      onStatusChangeRef.current?.('listening');
      setConnectionState('capturing');
    } catch (err) {
      disconnect();
      notifyError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }, [disconnect, fetchEphemeralToken, getAuthToken, handleDataMessage, initialiseMicrophone, notifyError, resetState, sendEvent, setConnectionState, waitForIceGatheringComplete]);

  const stop = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const latestStopRef = useRef<() => void>(() => {});

  useEffect(() => {
    latestStopRef.current = stop;
  }, [stop]);

  useEffect(() => {
    return () => {
      latestStopRef.current();
    };
  }, []);

  return {
    start,
    stop,
  } as const;
}
