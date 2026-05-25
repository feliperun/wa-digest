import assert from "node:assert/strict";
import test from "node:test";
import { TranscriberController } from "../src/transcription/controller.js";
import type { TranscriberProvider } from "../src/transcription/provider.js";
import { TranscriptionWorker } from "../src/worker/transcription-worker.js";
import { createMemoryStore, testConfig } from "./helpers.js";

class StaticProvider implements TranscriberProvider {
  readonly name = "static-test";

  async transcribe() {
    return {
      text: "transcricao sintetica do audio",
      provider: this.name,
      model: "test-model"
    };
  }
}

class FailingProvider implements TranscriberProvider {
  readonly name = "failing-test";

  async transcribe() {
    throw new Error("provider unavailable");
  }
}

function audioMessage(id: string) {
  return {
    id,
    instance: "test-instance",
    chatJid: "100000000000000001@g.us",
    participantJid: "100000000000001@s.whatsapp.net",
    senderName: "Contato Teste",
    fromMe: false,
    timestamp: Math.floor(Date.now() / 1000),
    text: "",
    mediaKind: "audio" as const,
    media: {
      mimetype: "audio/ogg; codecs=opus",
      base64: Buffer.from("fake audio bytes").toString("base64")
    },
    raw: {}
  };
}

test("worker processes transcription job and updates status", async () => {
  const config = testConfig();
  const { store, pool } = await createMemoryStore();
  await store.saveMessage(audioMessage("audio-success"));
  const worker = new TranscriptionWorker(config, store, new TranscriberController(config, new StaticProvider()));

  try {
    await worker.process({ instance: "test-instance", messageId: "audio-success" });
    const messages = await store.getMessages("100000000000000001@g.us", 0);
    assert.equal(messages[0].analysis?.status, "transcribed");
    assert.equal(messages[0].analysis?.transcript, "transcricao sintetica do audio");
  } finally {
    await pool.end();
  }
});

test("provider failure marks transcription as failed", async () => {
  const config = testConfig();
  const { store, pool } = await createMemoryStore();
  await store.saveMessage(audioMessage("audio-failure"));
  const worker = new TranscriptionWorker(config, store, new TranscriberController(config, new FailingProvider()));

  try {
    await assert.rejects(() => worker.process({ instance: "test-instance", messageId: "audio-failure" }), /provider unavailable/);
    const messages = await store.getMessages("100000000000000001@g.us", 0);
    assert.equal(messages[0].analysis?.status, "failed");
    assert.match(messages[0].analysis?.error || "", /provider unavailable/);
  } finally {
    await pool.end();
  }
});

test("worker records missing queued messages without retrying forever", async () => {
  const config = testConfig();
  const { store, pool } = await createMemoryStore();
  const worker = new TranscriptionWorker(config, store, new TranscriberController(config, new StaticProvider()));

  try {
    await worker.process({ instance: "test-instance", messageId: "missing-message" });
  } finally {
    await pool.end();
  }
});

test("worker rejects media over configured byte limit", async () => {
  const config = testConfig({ maxTranscriptionMediaBytes: 4 });
  const { store, pool } = await createMemoryStore();
  await store.saveMessage(audioMessage("audio-too-large"));
  const worker = new TranscriptionWorker(config, store, new TranscriberController(config, new StaticProvider()));

  try {
    await worker.process({ instance: "test-instance", messageId: "audio-too-large" });
    const messages = await store.getMessages("100000000000000001@g.us", 0);
    assert.equal(messages[0].analysis?.status, "rejected");
    assert.match(messages[0].analysis?.error || "", /MAX_TRANSCRIPTION_MEDIA_BYTES/);
  } finally {
    await pool.end();
  }
});

test("worker rejects disallowed transcription mimetypes", async () => {
  const config = testConfig({ transcriptionAllowedMimeTypes: ["audio/mpeg"] });
  const { store, pool } = await createMemoryStore();
  await store.saveMessage(audioMessage("audio-disallowed-mime"));
  const worker = new TranscriptionWorker(config, store, new TranscriberController(config, new StaticProvider()));

  try {
    await worker.process({ instance: "test-instance", messageId: "audio-disallowed-mime" });
    const messages = await store.getMessages("100000000000000001@g.us", 0);
    assert.equal(messages[0].analysis?.status, "rejected");
    assert.match(messages[0].analysis?.error || "", /mimetype is not allowed/);
  } finally {
    await pool.end();
  }
});

test("worker enforces the daily transcription budget stub", async () => {
  const config = testConfig({ maxTranscriptionMinutesPerDay: 0.5 });
  const { store, pool } = await createMemoryStore();
  await store.saveMessage(audioMessage("audio-budget"));
  const worker = new TranscriptionWorker(config, store, new TranscriberController(config, new StaticProvider()));

  try {
    await worker.process({ instance: "test-instance", messageId: "audio-budget" });
    const messages = await store.getMessages("100000000000000001@g.us", 0);
    assert.equal(messages[0].analysis?.status, "rejected");
    assert.match(messages[0].analysis?.error || "", /daily transcription budget exceeded/);
  } finally {
    await pool.end();
  }
});
