import type { Queryable } from "../db/pool.js";
import type { MediaAnalysis, MediaKind, MediaStatus, NormalizedMessage, SaveMessageResult, StoredMessage } from "../types.js";

export interface TimelineMessage extends StoredMessage {
  analysis?: MediaAnalysis;
}

interface MessageRow {
  instance: string;
  message_id: string;
  chat_jid: string;
  participant_jid: string | null;
  sender_name: string | null;
  from_me: boolean;
  message_ts: string | number;
  text: string;
  media_kind: MediaKind;
  media: NormalizedMessage["media"] | null;
  raw: unknown;
  received_at: Date | string;
  inserted?: boolean;
  media_status?: MediaStatus | null;
  storage_path?: string | null;
  source?: string | null;
  sha256?: string | null;
  bytes?: string | number | null;
  media_error?: string | null;
  transcript_status?: MediaStatus | null;
  transcript?: string | null;
  provider?: string | null;
  model?: string | null;
  transcript_error?: string | null;
}

function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function asNumber(value: string | number | null | undefined): number | undefined {
  if (value == null) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function rowToMessage(row: MessageRow): StoredMessage {
  return {
    id: row.message_id,
    instance: row.instance,
    chatJid: row.chat_jid,
    participantJid: row.participant_jid || undefined,
    senderName: row.sender_name || undefined,
    fromMe: row.from_me,
    timestamp: Number(row.message_ts),
    text: row.text,
    mediaKind: row.media_kind,
    media: row.media || undefined,
    raw: row.raw,
    receivedAt: asIso(row.received_at)
  };
}

function rowToTimelineMessage(row: MessageRow): TimelineMessage {
  const message = rowToMessage(row);
  if (!row.media_status && !row.transcript_status) return message;

  const analysisStatus = row.transcript_status || row.media_status || "none";
  return {
    ...message,
    analysis: {
      instance: row.instance,
      messageId: row.message_id,
      chatJid: row.chat_jid,
      status: analysisStatus,
      mediaKind: row.media_kind,
      storagePath: row.storage_path || undefined,
      transcript: row.transcript || undefined,
      artifacts: row.storage_path ? { media: row.storage_path } : undefined,
      modelMeta: {
        source: row.source || undefined,
        sha256: row.sha256 || undefined,
        bytes: asNumber(row.bytes),
        provider: row.provider || undefined,
        model: row.model || undefined,
        mediaStatus: row.media_status || undefined,
        transcriptionStatus: row.transcript_status || undefined
      },
      error: row.transcript_error || row.media_error || undefined,
      updatedAt: new Date().toISOString()
    }
  };
}

export class PgStore {
  constructor(private readonly db: Queryable) {}

  async saveMessage(message: Omit<StoredMessage, "receivedAt">): Promise<SaveMessageResult> {
    const existing = await this.db.query<MessageRow>(
      `SELECT *, false AS inserted FROM digest.messages WHERE instance = $1 AND message_id = $2`,
      [message.instance, message.id]
    );
    let row = existing.rows[0];
    let inserted = false;

    if (!row) {
      const insertResult = await this.db.query<MessageRow>(
        `
        INSERT INTO digest.messages (
          instance, message_id, chat_jid, participant_jid, sender_name, from_me,
          message_ts, text, media_kind, media, raw
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)
        ON CONFLICT (instance, message_id) DO NOTHING
        RETURNING *, true AS inserted
        `,
        [
          message.instance,
          message.id,
          message.chatJid,
          message.participantJid || null,
          message.senderName || null,
          message.fromMe,
          message.timestamp,
          message.text,
          message.mediaKind,
          JSON.stringify(message.media || null),
          JSON.stringify(message.raw)
        ]
      );
      row = insertResult.rows[0];
      inserted = Boolean(row);
      if (!row) {
        const selectResult = await this.db.query<MessageRow>(
          `SELECT *, false AS inserted FROM digest.messages WHERE instance = $1 AND message_id = $2`,
          [message.instance, message.id]
        );
        row = selectResult.rows[0];
      }
    }
    if (!row) throw new Error("failed to persist message");

    if (message.mediaKind !== "text") {
      await this.upsertMediaFromMessage(message, message.mediaKind === "audio" || message.mediaKind === "video" ? "processing" : "metadata_only");
      if (message.mediaKind === "audio" || message.mediaKind === "video") {
        await this.upsertTranscriptionStatus(message.instance, message.id, "processing");
      }
    }

    return { message: rowToMessage(row), inserted };
  }

  async getMessage(instance: string, messageId: string): Promise<StoredMessage | undefined> {
    const result = await this.db.query<MessageRow>(
      `SELECT * FROM digest.messages WHERE instance = $1 AND message_id = $2`,
      [instance, messageId]
    );
    return result.rows[0] ? rowToMessage(result.rows[0]) : undefined;
  }

  async listChats(): Promise<Array<{ jid: string; messageCount: number; lastTimestamp: number }>> {
    const result = await this.db.query<{ jid: string; message_count: string | number; last_timestamp: string | number }>(
      `
      SELECT chat_jid AS jid, count(*) AS message_count, max(message_ts) AS last_timestamp
      FROM digest.messages
      GROUP BY chat_jid
      ORDER BY max(message_ts) DESC
      `
    );
    return result.rows.map((row) => ({
      jid: row.jid,
      messageCount: Number(row.message_count),
      lastTimestamp: Number(row.last_timestamp)
    }));
  }

  async getMessages(chatJid: string, sinceTimestamp: number): Promise<TimelineMessage[]> {
    const result = await this.db.query<MessageRow>(
      `
      SELECT
        m.*,
        media.status AS media_status,
        media.storage_path,
        media.source,
        media.sha256,
        media.bytes,
        media.error AS media_error,
        transcriptions.status AS transcript_status,
        transcriptions.transcript,
        transcriptions.provider,
        transcriptions.model,
        transcriptions.error AS transcript_error
      FROM digest.messages m
      LEFT JOIN digest.media media
        ON media.instance = m.instance AND media.message_id = m.message_id
      LEFT JOIN digest.transcriptions transcriptions
        ON transcriptions.instance = m.instance AND transcriptions.message_id = m.message_id
      WHERE m.chat_jid = $1 AND m.message_ts >= $2
      ORDER BY m.message_ts ASC, m.received_at ASC
      `,
      [chatJid, sinceTimestamp]
    );
    return result.rows.map(rowToTimelineMessage);
  }

  async getAnalysisByMessageId(messageId: string): Promise<MediaAnalysis | undefined> {
    const result = await this.db.query<MessageRow>(
      `
      SELECT
        m.*,
        media.status AS media_status,
        media.storage_path,
        media.source,
        media.sha256,
        media.bytes,
        media.error AS media_error,
        transcriptions.status AS transcript_status,
        transcriptions.transcript,
        transcriptions.provider,
        transcriptions.model,
        transcriptions.error AS transcript_error
      FROM digest.messages m
      LEFT JOIN digest.media media
        ON media.instance = m.instance AND media.message_id = m.message_id
      LEFT JOIN digest.transcriptions transcriptions
        ON transcriptions.instance = m.instance AND transcriptions.message_id = m.message_id
      WHERE m.message_id = $1
      ORDER BY m.received_at DESC
      LIMIT 1
      `,
      [messageId]
    );
    return result.rows[0] ? rowToTimelineMessage(result.rows[0]).analysis : undefined;
  }

  async saveMediaResolved(input: {
    instance: string;
    messageId: string;
    storagePath: string;
    source: string;
    sha256: string;
    bytes: number;
  }): Promise<void> {
    await this.db.query(
      `
      UPDATE digest.media
      SET storage_path = $3, source = $4, sha256 = $5, bytes = $6, error = NULL, updated_at = now()
      WHERE instance = $1 AND message_id = $2
      `,
      [input.instance, input.messageId, input.storagePath, input.source, input.sha256, input.bytes]
    );
  }

  async markMediaStatus(instance: string, messageId: string, status: MediaStatus, error?: string): Promise<void> {
    await this.db.query(
      `
      UPDATE digest.media
      SET status = $3, error = $4, updated_at = now()
      WHERE instance = $1 AND message_id = $2
      `,
      [instance, messageId, status, error || null]
    );
  }

  async upsertTranscriptionStatus(instance: string, messageId: string, status: MediaStatus, error?: string): Promise<void> {
    await this.db.query(
      `
      INSERT INTO digest.transcriptions (instance, message_id, status, error)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (instance, message_id) DO UPDATE
      SET status = EXCLUDED.status, error = EXCLUDED.error, updated_at = now()
      `,
      [instance, messageId, status, error || null]
    );
  }

  async saveTranscriptionResult(input: {
    instance: string;
    messageId: string;
    provider: string;
    model?: string;
    transcript: string;
    segments?: unknown;
    raw?: unknown;
  }): Promise<void> {
    await this.db.query(
      `
      INSERT INTO digest.transcriptions (instance, message_id, status, provider, model, transcript, segments, raw, error)
      VALUES ($1, $2, 'transcribed', $3, $4, $5, $6::jsonb, $7::jsonb, NULL)
      ON CONFLICT (instance, message_id) DO UPDATE
      SET status = 'transcribed',
          provider = EXCLUDED.provider,
          model = EXCLUDED.model,
          transcript = EXCLUDED.transcript,
          segments = EXCLUDED.segments,
          raw = EXCLUDED.raw,
          error = NULL,
          updated_at = now()
      `,
      [
        input.instance,
        input.messageId,
        input.provider,
        input.model || null,
        input.transcript,
        JSON.stringify(input.segments || null),
        JSON.stringify(input.raw || null)
      ]
    );
  }

  private async upsertMediaFromMessage(message: Omit<StoredMessage, "receivedAt">, status: MediaStatus): Promise<void> {
    await this.db.query(
      `
      INSERT INTO digest.media (
        instance, message_id, chat_jid, media_kind, status, mimetype, file_name, media_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (instance, message_id) DO UPDATE
      SET mimetype = COALESCE(EXCLUDED.mimetype, digest.media.mimetype),
          file_name = COALESCE(EXCLUDED.file_name, digest.media.file_name),
          media_url = COALESCE(EXCLUDED.media_url, digest.media.media_url),
          updated_at = now()
      `,
      [
        message.instance,
        message.id,
        message.chatJid,
        message.mediaKind,
        status,
        message.media?.mimetype || null,
        message.media?.fileName || null,
        message.media?.mediaUrl || null
      ]
    );
  }
}
