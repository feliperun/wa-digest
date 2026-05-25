import PgBoss from "pg-boss";
import type { AppConfig } from "../config.js";
import type { NormalizedMessage } from "../types.js";

export const TRANSCRIPTION_QUEUE = "transcription";
export const TRANSCRIPTION_RETRY_LIMIT = 3;
export const TRANSCRIPTION_RETRY_DELAY_SECONDS = 5;
export const TRANSCRIPTION_RETRY_BACKOFF = true;

export interface TranscriptionJobData {
  instance: string;
  messageId: string;
}

export interface TranscriptionQueue {
  enqueueTranscription(message: NormalizedMessage): Promise<string | null>;
  close?(): Promise<void>;
}

export class NullTranscriptionQueue implements TranscriptionQueue {
  readonly jobs: TranscriptionJobData[] = [];

  async enqueueTranscription(message: NormalizedMessage): Promise<string | null> {
    this.jobs.push({ instance: message.instance, messageId: message.id });
    return null;
  }
}

export class PgBossTranscriptionQueue implements TranscriptionQueue {
  private boss?: PgBoss;
  private started?: Promise<PgBoss>;

  constructor(private readonly config: AppConfig) {}

  async enqueueTranscription(message: NormalizedMessage): Promise<string | null> {
    const boss = await this.ensureStarted();
    return boss.send(
      TRANSCRIPTION_QUEUE,
      { instance: message.instance, messageId: message.id },
      {
        retryLimit: TRANSCRIPTION_RETRY_LIMIT,
        retryDelay: TRANSCRIPTION_RETRY_DELAY_SECONDS,
        retryBackoff: TRANSCRIPTION_RETRY_BACKOFF,
        singletonKey: `${message.instance}:${message.id}`,
        singletonSeconds: 60 * 60 * 24 * 7
      }
    );
  }

  async close(): Promise<void> {
    if (this.boss) await this.boss.stop({ graceful: true, close: true });
  }

  private async ensureStarted(): Promise<PgBoss> {
    if (!this.started) {
      if (!this.config.databaseUrl) throw new Error("DATABASE_URL is not configured");
      this.started = (async () => {
        const boss = new PgBoss({
          connectionString: this.config.databaseUrl,
          schema: "digest",
          migrate: false,
          supervise: false,
          schedule: false
        });
        boss.on("error", () => undefined);
        await boss.start();
        this.boss = boss;
        return boss;
      })();
    }
    return this.started;
  }
}
