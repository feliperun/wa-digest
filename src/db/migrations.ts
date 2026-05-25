import PgBoss from "pg-boss";
import { createPgPool, type Queryable } from "./pool.js";
import type { AppConfig } from "../config.js";
import { TRANSCRIPTION_QUEUE } from "../queue/transcription-queue.js";

export const DIGEST_MIGRATION_SQL = `
CREATE SCHEMA IF NOT EXISTS digest;

CREATE TABLE IF NOT EXISTS digest.messages (
  instance text NOT NULL,
  message_id text NOT NULL,
  chat_jid text NOT NULL,
  participant_jid text,
  sender_name text,
  from_me boolean NOT NULL,
  message_ts bigint NOT NULL,
  text text NOT NULL DEFAULT '',
  media_kind text NOT NULL,
  media jsonb,
  raw jsonb NOT NULL,
  origin text NOT NULL DEFAULT 'webhook',
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instance, message_id)
);

CREATE INDEX IF NOT EXISTS messages_chat_ts_idx
  ON digest.messages (chat_jid, message_ts DESC);

CREATE TABLE IF NOT EXISTS digest.media (
  instance text NOT NULL,
  message_id text NOT NULL,
  chat_jid text NOT NULL,
  media_kind text NOT NULL,
  status text NOT NULL,
  mimetype text,
  file_name text,
  media_url text,
  storage_path text,
  source text,
  sha256 text,
  bytes bigint,
  error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instance, message_id),
  FOREIGN KEY (instance, message_id)
    REFERENCES digest.messages (instance, message_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS media_status_idx
  ON digest.media (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS digest.transcriptions (
  instance text NOT NULL,
  message_id text NOT NULL,
  status text NOT NULL,
  provider text,
  model text,
  transcript text,
  segments jsonb,
  raw jsonb,
  duration_seconds numeric,
  cost_usd numeric,
  error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instance, message_id),
  FOREIGN KEY (instance, message_id)
    REFERENCES digest.messages (instance, message_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS transcriptions_status_idx
  ON digest.transcriptions (status, updated_at DESC);
`;

export async function runDigestMigrations(db: Queryable): Promise<void> {
  await db.query(DIGEST_MIGRATION_SQL);
}

export async function migrateDatabase(config: AppConfig): Promise<void> {
  const pool = createPgPool(config);
  try {
    await runDigestMigrations(pool);
    const boss = new PgBoss({
      connectionString: config.databaseUrl,
      schema: "digest",
      migrate: true,
      supervise: false,
      schedule: false
    });
    boss.on("error", () => undefined);
    await boss.start();
    await boss.createQueue(TRANSCRIPTION_QUEUE, {
      name: TRANSCRIPTION_QUEUE,
      retryLimit: 3,
      retryDelay: 5,
      retryBackoff: true
    });
    await boss.stop({ graceful: true, close: true });
  } finally {
    await pool.end();
  }
}
