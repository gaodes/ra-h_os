import { useEffect, useRef, useState } from 'react';
import type { TTSStatus } from './useAssistantTTS';

interface UseVoiceInterruptionOptions {
  amplitude: number;
  isVoiceActive: boolean;
  ttsStatus: TTSStatus;
  threshold?: number;
  holdDurationMs?: number;
  cooldownMs?: number;
  onInterruption: () => void;
}

const DEFAULT_THRESHOLD = 0.18;
const DEFAULT_HOLD_MS = 120;
const DEFAULT_COOLDOWN_MS = 800;

export function useVoiceInterruption(options: UseVoiceInterruptionOptions) {
  const {
    amplitude,
    isVoiceActive,
    ttsStatus,
    onInterruption,
    threshold = DEFAULT_THRESHOLD,
    holdDurationMs = DEFAULT_HOLD_MS,
    cooldownMs = DEFAULT_COOLDOWN_MS,
  } = options;

  const [isInterrupting, setIsInterrupting] = useState(false);
  const detectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInterruptionAtRef = useRef(0);

  useEffect(() => {
    return () => {
      if (detectionTimeoutRef.current) {
        clearTimeout(detectionTimeoutRef.current);
        detectionTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const clearDetection = () => {
      if (detectionTimeoutRef.current) {
        clearTimeout(detectionTimeoutRef.current);
        detectionTimeoutRef.current = null;
      }
    };

    if (!isVoiceActive || ttsStatus === 'idle') {
      clearDetection();
      if (isInterrupting) {
        setIsInterrupting(false);
      }
      return;
    }

    if (amplitude < threshold) {
      clearDetection();
      if (isInterrupting) {
        setIsInterrupting(false);
      }
      return;
    }

    const now = Date.now();
    if (now - lastInterruptionAtRef.current < cooldownMs) {
      return;
    }

    if (detectionTimeoutRef.current) {
      return;
    }

    detectionTimeoutRef.current = setTimeout(() => {
      lastInterruptionAtRef.current = Date.now();
      setIsInterrupting(true);
      onInterruption();
    }, holdDurationMs);
  }, [amplitude, cooldownMs, holdDurationMs, isInterrupting, isVoiceActive, onInterruption, threshold, ttsStatus]);

  return { isInterrupting } as const;
}
