import { NextRequest, NextResponse } from 'next/server';

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-12-17';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });
    }

    const apiKey =
      process.env.RAH_REALTIME_OPENAI_API_KEY ||
      process.env.RAH_DELEGATE_OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Realtime OpenAI API key is not configured' }, { status: 500 });
    }

    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: REALTIME_MODEL,
        modalities: ['text'],
        instructions: 'Provide high-accuracy streaming transcription only. Never speak responses.',
      }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      const message = errorPayload?.error?.message || response.statusText || 'Failed to create realtime session';
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json({
      client_secret: data.client_secret,
      expires_at: data.expires_at,
      model: data.model ?? REALTIME_MODEL,
      voice: data.voice,
      id: data.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[realtime] Failed to mint ephemeral token:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
