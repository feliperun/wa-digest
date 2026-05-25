import assert from "node:assert/strict";
import test from "node:test";
import PgBoss from "pg-boss";
import { Pool } from "pg";
import { migrateDatabase } from "../src/db/migrations.js";
import { PgBossTranscriptionQueue, TRANSCRIPTION_QUEUE, type TranscriptionJobData } from "../src/queue/transcription-queue.js";
import { testConfig } from "./helpers.js";

const postgresTest = process.env.DATABASE_URL_TEST ? test : test.skip;

postgresTest("real Postgres migration keeps digest-owned tables and pg-boss queue usable", async () => {
  const databaseUrl = process.env.DATABASE_URL_TEST!;
  const config = testConfig({ databaseUrl });
  await migrateDatabase(config);

  const pool = new Pool({ connectionString: databaseUrl });
  const queue = new PgBossTranscriptionQueue(config);
  const boss = new PgBoss({
    connectionString: databaseUrl,
    schema: "digest",
    migrate: false,
    supervise: false,
    schedule: false
  });

  try {
    const digestTables = await pool.query<{ table_name: string }>(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'digest'
        AND table_name IN ('messages', 'media', 'transcriptions', 'job', 'queue')
      `
    );
    assert.deepEqual(
      digestTables.rows.map((row) => row.table_name).sort(),
      ["job", "media", "messages", "queue", "transcriptions"]
    );

    const publicBossTables = await pool.query<{ count: string }>(
      `
      SELECT count(*) AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('job', 'queue', 'archive', 'version', 'schedule', 'subscription')
      `
    );
    assert.equal(Number(publicBossTables.rows[0]?.count || 0), 0);

    const message = {
      id: `pg-real-${Date.now()}`,
      instance: "test-instance",
      chatJid: "100000000000000001@g.us",
      fromMe: false,
      timestamp: Math.floor(Date.now() / 1000),
      text: "",
      mediaKind: "audio" as const,
      media: { mimetype: "audio/ogg" },
      raw: {}
    };
    const jobId = await queue.enqueueTranscription(message);
    assert.equal(typeof jobId, "string");

    await boss.start();
    const jobs = await boss.fetch<TranscriptionJobData>(TRANSCRIPTION_QUEUE, { batchSize: 1 });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].data.instance, "test-instance");
    assert.equal(jobs[0].data.messageId, message.id);
    await boss.complete(TRANSCRIPTION_QUEUE, jobs[0].id);
  } finally {
    await queue.close?.();
    await boss.stop({ graceful: true, close: true }).catch(() => undefined);
    await pool.end();
  }
});
