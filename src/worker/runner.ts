import PgBoss from "pg-boss";
import type { AppConfig } from "../config.js";
import { createPgPool } from "../db/pool.js";
import { PgStore } from "../store/pg-store.js";
import { TRANSCRIPTION_QUEUE, type TranscriptionJobData } from "../queue/transcription-queue.js";
import { TranscriptionWorker } from "./transcription-worker.js";

export interface RunningWorker {
  stop(): Promise<void>;
}

export async function startTranscriptionWorker(config: AppConfig): Promise<RunningWorker> {
  const pool = createPgPool(config);
  const store = new PgStore(pool);
  const worker = new TranscriptionWorker(config, store);
  const boss = new PgBoss({
    connectionString: config.databaseUrl,
    schema: "digest",
    migrate: false,
    supervise: true,
    schedule: false
  });
  boss.on("error", () => undefined);
  await boss.start();
  await boss.work<TranscriptionJobData>(
    TRANSCRIPTION_QUEUE,
    {
      batchSize: config.maxConcurrentTranscriptions,
      pollingIntervalSeconds: 2
    },
    async (jobs) => {
      for (const job of jobs) {
        await worker.process(job.data);
      }
    }
  );

  return {
    async stop() {
      await boss.stop({ graceful: true, close: true });
      await pool.end();
    }
  };
}
