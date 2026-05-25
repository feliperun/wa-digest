import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { newDb } from "pg-mem";
import type { AppConfig } from "../src/config.js";
import { runDigestMigrations } from "../src/db/migrations.js";
import { PgStore } from "../src/store/pg-store.js";

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    apiToken: "test-token",
    evolutionBaseUrl: "http://127.0.0.1:9",
    evolutionApiKey: "test-key",
    evolutionInstance: "test-instance",
    databaseUrl: "postgresql://test:test@127.0.0.1:5432/test",
    mediaStorageDir: mkdtempSync(path.join(tmpdir(), "wa-digest-")),
    transcriberProvider: "noop",
    sonioxModel: "stt-test",
    visionProvider: "metadata",
    visionModel: "vision-test",
    maxConcurrentTranscriptions: 1,
    openclawCompat: true,
    ...overrides
  };
}

export async function createMemoryStore(): Promise<{ store: PgStore; pool: { end(): Promise<void> } }> {
  const db = newDb();
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool();
  await runDigestMigrations(pool);
  return { store: new PgStore(pool), pool };
}
