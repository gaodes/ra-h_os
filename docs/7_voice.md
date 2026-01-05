# Voice Interface

> Talk to RA-H instead of typing.

**How it works:** Press the microphone button to speak your message. RA-H converts your speech to text using OpenAI's Realtime API, sends it to the AI, and speaks the response back using text-to-speech. All processing requires an internet connection.

---

## Overview

The voice interface lets you have spoken conversations with RA-H. It uses:

- **Speech-to-Text (STT):** OpenAI Realtime API for low-latency transcription
- **Text-to-Speech (TTS):** OpenAI TTS for natural voice responses
- **Same AI agents:** Your voice messages go to the same orchestrator (Easy/Hard mode)

---

## Using Voice

### Starting a Voice Session

1. Click the **microphone icon** in the chat panel
2. Grant microphone permission if prompted
3. Speak naturally — RA-H transcribes in real-time
4. The AI responds with both text and audio

### Visual Feedback

- **"RA-H is listening"** strip appears when active
- **Amplitude bars** show microphone input level
- **Transcript preview** shows what's being recognized

### Stopping Voice Input

- Click the microphone button again
- Or wait for silence detection (~800ms pause)

---

## Requirements

| Requirement | Details |
|-------------|---------|
| **API Key** | OpenAI API key (same key used for Easy mode) |
| **Internet** | Required for STT and TTS |
| **Microphone** | Mac app requests permission on first use |
| **macOS** | 12+ (Monterey or later) |

---

## Cost

Voice features use OpenAI's APIs which have usage costs:

| Feature | Pricing |
|---------|---------|
| **Realtime STT** | Included in Realtime API usage |
| **TTS** | ~$0.015 per 1,000 characters |

Costs are tracked in:
- Per-message metadata (`voice_tts_*` fields)
- `voice_usage` SQLite table
- Settings → Analytics panel

---

## Limitations

- **Internet required** — No offline voice support
- **English optimized** — Other languages may have lower accuracy
- **No voice selection** — Uses default OpenAI voice
- **Mac only** — Voice features not available in web/open-source version

---

## Technical Details

### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/realtime/ephemeral-token` | Get temporary token for Realtime API |
| `/api/voice/tts` | Convert text to speech |

### Key Files

| File | Purpose |
|------|---------|
| `src/components/agents/hooks/useRealtimeVoiceClient.ts` | STT WebSocket client |
| `src/components/agents/hooks/useAssistantTTS.ts` | TTS playback |
| `app/api/realtime/ephemeral-token/route.ts` | Token endpoint |
| `app/api/voice/tts/route.ts` | TTS endpoint |

### Environment Variables

```bash
# Required for voice
OPENAI_API_KEY=sk-...

# Optional: cost tracking
RAH_TTS_COST_PER_1K_CHAR_USD=0.015
```

---

## Troubleshooting

### "Microphone not working"

1. Check System Preferences → Privacy → Microphone → RA-H is allowed
2. Restart the app after granting permission
3. Test microphone in other apps

### "Voice isn't responding"

1. Check internet connection
2. Verify OpenAI API key is valid
3. Check Settings → API Keys

### "Transcription is inaccurate"

- Speak clearly and at normal pace
- Reduce background noise
- Voice works best in quiet environments
