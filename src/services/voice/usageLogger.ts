import { getSQLiteClient } from '@/services/database/sqlite-client';

export interface VoiceUsageLogEntry {
  sessionId?: string | null;
  helperName?: string | null;
  requestId: string;
  messageId?: string | null;
  voice: string;
  model: string;
  charCount: number;
  costUsd: number;
  durationMs?: number | null;
  textPreview?: string | null;
}

type ChatRow = {
  id: number;
  metadata: string | null;
};

function parseMetadata(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.warn('[VoiceUsage] Failed to parse chat metadata JSON', error);
      return {};
    }
  }
  if (typeof raw === 'object') {
    return (raw as Record<string, any>) || {};
  }
  return {};
}

function applyVoiceUsageMetadata(
  metadata: Record<string, any>,
  entry: VoiceUsageLogEntry,
  loggedAt: string
): Record<string, any> {
  const usageList = Array.isArray(metadata.voice_usage) ? metadata.voice_usage : [];

  const usageEntry = {
    request_id: entry.requestId,
    message_id: entry.messageId ?? null,
    chars: entry.charCount,
    cost_usd: entry.costUsd,
    voice: entry.voice,
    model: entry.model,
    duration_ms: entry.durationMs ?? null,
    logged_at: loggedAt,
  };

  usageList.push(usageEntry);
  const MAX_USAGE_HISTORY = 20;
  metadata.voice_usage = usageList.slice(-MAX_USAGE_HISTORY);

  const currentCharsTotal = Number(metadata.voice_tts_chars_total) || 0;
  const currentCostTotal = Number(metadata.voice_tts_cost_usd_total) || Number(metadata.voice_tts_cost_total_usd) || 0;
  const currentRequestCount = Number(metadata.voice_tts_request_count) || 0;

  metadata.voice_tts_chars_total = currentCharsTotal + entry.charCount;
  metadata.voice_tts_cost_usd_total = parseFloat((currentCostTotal + entry.costUsd).toFixed(6));
  metadata.voice_tts_request_count = currentRequestCount + 1;

  metadata.voice_tts_chars = entry.charCount;
  metadata.voice_tts_cost_usd = entry.costUsd;
  metadata.voice_request_id = entry.requestId;
  metadata.voice_tts_voice = entry.voice;
  metadata.voice_tts_model = entry.model;
  metadata.voice_tts_duration_ms = entry.durationMs ?? null;
  metadata.voice_tts_last_logged_at = loggedAt;
  metadata.voice_message_id = entry.messageId ?? null;

  return metadata;
}

export function recordVoiceUsage(entry: VoiceUsageLogEntry): void {
  try {
    const sqlite = getSQLiteClient();
    const loggedAt = new Date().toISOString();
    let chatId: number | null = null;

    if (entry.sessionId) {
      try {
        const row = sqlite
          .prepare(
            `
            SELECT id, metadata
            FROM chats
            WHERE json_extract(metadata, '$.session_id') = ?
            ORDER BY id DESC
            LIMIT 1
          `
          )
          .get(entry.sessionId) as ChatRow | undefined;

        if (row) {
          chatId = row.id;
          const parsedMetadata = applyVoiceUsageMetadata(parseMetadata(row.metadata), entry, loggedAt);
          sqlite
            .prepare(`UPDATE chats SET metadata = ? WHERE id = ?`)
            .run(JSON.stringify(parsedMetadata), row.id);
        } else {
          console.warn(`[VoiceUsage] No chat row found for session ${entry.sessionId}, logging standalone entry.`);
        }
      } catch (error) {
        console.error('[VoiceUsage] Failed to attach usage to chat metadata', error);
      }
    }

    try {
      sqlite
        .prepare(
          `
          INSERT INTO voice_usage (
            chat_id,
            session_id,
            helper_name,
            request_id,
            message_id,
            voice,
            model,
            chars,
            cost_usd,
            duration_ms,
            text_preview,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          chatId,
          entry.sessionId ?? null,
          entry.helperName ?? null,
          entry.requestId,
          entry.messageId ?? null,
          entry.voice,
          entry.model,
          entry.charCount,
          entry.costUsd,
          entry.durationMs ?? null,
          entry.textPreview ?? null,
          loggedAt
        );
    } catch (error) {
      console.error('[VoiceUsage] Failed to insert voice usage row', error);
    }
  } catch (outerError) {
    console.error('[VoiceUsage] Unexpected error while recording usage', outerError);
  }
}
