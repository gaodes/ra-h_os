import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { recordVoiceUsage } from '@/services/voice/usageLogger';

const OPENAI_TTS_MODEL = process.env.RAH_TTS_MODEL || 'gpt-4o-mini-tts';
const DEFAULT_TTS_VOICE = process.env.RAH_TTS_VOICE || 'ash';
const DEFAULT_TTS_COST_PER_1K_CHAR_USD = 0.015;
const TTS_COST_PER_1K_CHAR_USD = (() => {
  const raw = process.env.RAH_TTS_COST_PER_1K_CHAR_USD;
  if (!raw) return DEFAULT_TTS_COST_PER_1K_CHAR_USD;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTS_COST_PER_1K_CHAR_USD;
})();

function estimateTtsCost(charCount: number) {
  const cost = (charCount / 1000) * TTS_COST_PER_1K_CHAR_USD;
  return Number.isFinite(cost) ? parseFloat(cost.toFixed(6)) : 0;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.RAH_VOICE_OPENAI_API_KEY || process.env.RAH_DELEGATE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key is not configured' }, { status: 500 });
    }

    const body = await request.json().catch(() => null);
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    const voice = typeof body?.voice === 'string' && body.voice.trim().length > 0 ? body.voice.trim() : DEFAULT_TTS_VOICE;
    const helperName = typeof body?.helper === 'string' && body.helper.trim().length > 0 ? body.helper.trim() : null;
    const sessionId = typeof body?.sessionId === 'string' && body.sessionId.trim().length > 0 ? body.sessionId.trim() : null;
    const messageId = typeof body?.messageId === 'string' && body.messageId.trim().length > 0 ? body.messageId.trim() : null;
    const providedRequestId = typeof body?.requestId === 'string' && body.requestId.trim().length > 0 ? body.requestId.trim() : null;
    const voiceRequestId = providedRequestId || randomUUID();

    if (!text) {
      return NextResponse.json({ error: 'Text is required for TTS' }, { status: 400 });
    }

    const requestStartedAt = Date.now();
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_TTS_MODEL,
        voice,
        input: text,
        format: 'mp3',
      }),
    });

    if (!response.ok || !response.body) {
      const errorPayload = await response.json().catch(() => null);
      const message = errorPayload?.error?.message || response.statusText || 'Failed to synthesize audio';
      return NextResponse.json({ error: message }, { status: response.status || 500 });
    }

    const durationMs = Date.now() - requestStartedAt;
    const charCount = [...text].length;
    const estimatedCostUsd = estimateTtsCost(charCount);
    const textPreview =
      text.length > 240 ? `${text.slice(0, 237)}...` : text;

    try {
      recordVoiceUsage({
        sessionId,
        helperName,
        requestId: voiceRequestId,
        messageId,
        voice,
        model: OPENAI_TTS_MODEL,
        charCount,
        costUsd: estimatedCostUsd,
        durationMs,
        textPreview,
      });
    } catch (loggingError) {
      console.error('[voice/tts] failed to record usage', loggingError);
    }

    const headers = new Headers();
    headers.set('Content-Type', response.headers.get('Content-Type') || 'audio/mpeg');
    headers.set('Cache-Control', 'no-cache');
    headers.set('X-Voice-Request-Id', voiceRequestId);

    return new Response(response.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[voice/tts] failed to synthesize:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
