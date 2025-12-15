import { useCallback, useEffect, useRef, useState } from 'react';

export type TTSStatus = 'idle' | 'loading' | 'speaking';

interface UseAssistantTTSOptions {
  voice?: string;
  onSpeechStart?: () => void;
  onSpeechComplete?: () => void;
  onError?: (error: Error) => void;
}

interface SpeakRequestMetadata {
  sessionId?: string | null;
  helper?: string | null;
  requestId?: string;
  messageId?: string | null;
}

interface SpeakOptions {
  flush?: boolean;
  metadata?: SpeakRequestMetadata;
}

type SpeakQueueItem = {
  text: string;
  metadata?: SpeakRequestMetadata;
};

export function useAssistantTTS(options: UseAssistantTTSOptions = {}) {
  const [status, setStatus] = useState<TTSStatus>('idle');
  const queueRef = useRef<SpeakQueueItem[]>([]);
  const isProcessingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const chunkQueueRef = useRef<ArrayBuffer[]>([]);
  const updateEndHandlerRef = useRef<(() => void) | null>(null);
  const readerDoneRef = useRef(false);
  const processQueueRef = useRef<(() => void) | null>(null);

  const onSpeechStartRef = useRef(options.onSpeechStart);
  const onSpeechCompleteRef = useRef(options.onSpeechComplete);
  const onErrorRef = useRef(options.onError);
  const voiceRef = useRef(options.voice);

  useEffect(() => {
    onSpeechStartRef.current = options.onSpeechStart;
  }, [options.onSpeechStart]);

  useEffect(() => {
    onSpeechCompleteRef.current = options.onSpeechComplete;
  }, [options.onSpeechComplete]);

  useEffect(() => {
    onErrorRef.current = options.onError;
  }, [options.onError]);

  useEffect(() => {
    voiceRef.current = options.voice;
  }, [options.voice]);

  const setStatusSafe = useCallback((next: TTSStatus) => {
    setStatus(next);
  }, []);

  const cleanupMedia = useCallback(() => {
    if (sourceBufferRef.current && updateEndHandlerRef.current) {
      try {
        sourceBufferRef.current.removeEventListener('updateend', updateEndHandlerRef.current);
      } catch (err) {
        console.warn('[TTS] Failed to detach source buffer listener', err);
      }
    }
    updateEndHandlerRef.current = null;
    sourceBufferRef.current = null;
    mediaSourceRef.current = null;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    chunkQueueRef.current = [];
    readerDoneRef.current = false;
  }, []);

  const handleError = useCallback((error: Error) => {
    console.error('[TTS] Playback error', error);
    onErrorRef.current?.(error);
  }, []);

  const stopCurrentPlayback = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      try {
        audio.load();
      } catch (err) {
        console.warn('[TTS] Failed to reset audio element', err);
      }
    }
    cleanupMedia();
    isProcessingRef.current = false;
  }, [cleanupMedia]);

  const ensureAudioElement = useCallback(() => {
    if (audioRef.current) {
      return audioRef.current;
    }
    const audio = new Audio();
    audio.autoplay = true;
    audio.preload = 'auto';
    audio.addEventListener('playing', () => {
      setStatusSafe('speaking');
      onSpeechStartRef.current?.();
    });
    audio.addEventListener('ended', () => {
      cleanupMedia();
      isProcessingRef.current = false;
      setStatusSafe('idle');
      onSpeechCompleteRef.current?.();
      processQueueRef.current?.();
    });
    audio.addEventListener('error', () => {
      handleError(new Error('Audio playback failed'));
      stopCurrentPlayback();
      processQueueRef.current?.();
    });
    audioRef.current = audio;
    return audio;
  }, [cleanupMedia, handleError, setStatusSafe, stopCurrentPlayback]);

  const flushChunks = useCallback(() => {
    const sourceBuffer = sourceBufferRef.current;
    const mediaSource = mediaSourceRef.current;
    if (!sourceBuffer || !mediaSource || sourceBuffer.updating) {
      return;
    }
    const nextChunk = chunkQueueRef.current.shift();
    if (nextChunk) {
      try {
        sourceBuffer.appendBuffer(nextChunk);
      } catch (error) {
        handleError(error instanceof Error ? error : new Error(String(error)));
      }
      return;
    }
    if (readerDoneRef.current && !sourceBuffer.updating) {
      try {
        mediaSource.endOfStream();
      } catch (error) {
        console.warn('[TTS] Failed to end media source stream', error);
      }
    }
  }, [handleError]);

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) {
      setStatusSafe('idle');
      return;
    }
    isProcessingRef.current = true;
    setStatusSafe('loading');
    try {
      const controller = new AbortController();
      abortRef.current = controller;
      const payload: Record<string, any> = {
        text: next.text,
        voice: voiceRef.current,
      };

      if (next.metadata?.sessionId) {
        payload.sessionId = next.metadata.sessionId;
      }
      if (next.metadata?.helper) {
        payload.helper = next.metadata.helper;
      }
      if (next.metadata?.requestId) {
        payload.requestId = next.metadata.requestId;
      }
      if (next.metadata?.messageId) {
        payload.messageId = next.metadata.messageId;
      }

      const response = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error((await response.text().catch(() => '')) || 'Failed to synthesize audio');
      }
      const reader = response.body.getReader();
      const audio = ensureAudioElement();
      cleanupMedia();
      const mimeType = response.headers.get('Content-Type') || 'audio/mpeg';
      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;
      const objectUrl = URL.createObjectURL(mediaSource);
      objectUrlRef.current = objectUrl;
      audio.src = objectUrl;
      audio.load();

      const onSourceOpen = () => {
        mediaSource.removeEventListener('sourceopen', onSourceOpen);
        let sourceBuffer: SourceBuffer;
        try {
          sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        } catch {
          throw new Error(`Unsupported audio format: ${mimeType}`);
        }
        sourceBufferRef.current = sourceBuffer;
        const handleUpdateEnd = () => flushChunks();
        updateEndHandlerRef.current = handleUpdateEnd;
        sourceBuffer.addEventListener('updateend', handleUpdateEnd);
        flushChunks();
      };

      mediaSource.addEventListener('sourceopen', onSourceOpen);

      const pump = async () => {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            readerDoneRef.current = true;
            flushChunks();
            break;
          }
          if (value) {
            const buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
            chunkQueueRef.current.push(buffer);
            flushChunks();
          }
        }
      };

      pump().catch((error) => {
        const err = error instanceof Error ? error : new Error(String(error));
        if ((err as DOMException).name !== 'AbortError') {
          handleError(err);
        }
        stopCurrentPlayback();
        processQueueRef.current?.();
      });

      audio.play().catch((error) => {
        handleError(error instanceof Error ? error : new Error(String(error)));
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      isProcessingRef.current = false;
      setStatusSafe('idle');
      handleError(error instanceof Error ? error : new Error(String(error)));
      processQueueRef.current?.();
    }
  }, [cleanupMedia, ensureAudioElement, flushChunks, handleError, setStatusSafe, stopCurrentPlayback]);

  processQueueRef.current = processQueue;

  const speak = useCallback(
    (text: string, options?: SpeakOptions) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (options?.flush) {
        queueRef.current = [{ text: trimmed, metadata: options.metadata }];
        stopCurrentPlayback();
      } else {
        queueRef.current.push({ text: trimmed, metadata: options?.metadata });
      }
      processQueue();
    },
    [processQueue, stopCurrentPlayback]
  );

  const stop = useCallback(() => {
    queueRef.current = [];
    stopCurrentPlayback();
    setStatusSafe('idle');
  }, [setStatusSafe, stopCurrentPlayback]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    status,
    speak,
    stop,
  } as const;
}
