import assert from "node:assert/strict";
import test from "node:test";
import { NullTranscriptionQueue } from "../src/queue/transcription-queue.js";
import { createMemoryStore, testConfig } from "./helpers.js";

test("duplicate webhook creates one message and one transcription job", async () => {
  const config = testConfig();
  const { store, pool } = await createMemoryStore();
  const queue = new NullTranscriptionQueue();
  const { createApp } = await import("../src/server.js");
  const app = createApp({ config, store, queue });
  const server = app.listen(0);
  const address = server.address();
  assert.equal(typeof address, "object");
  const base = `http://127.0.0.1:${address && typeof address === "object" ? address.port : 0}`;
  const headers = {
    authorization: "Bearer test-token",
    "content-type": "application/json"
  };
  const body = {
    event: "MESSAGES_UPSERT",
    instance: "test-instance",
    data: {
      key: {
        id: "audio-1",
        remoteJid: "100000000000000001@g.us",
        participant: "100000000000001@s.whatsapp.net",
        fromMe: false
      },
      pushName: "Contato Teste",
      messageTimestamp: Math.floor(Date.now() / 1000),
      base64: Buffer.from("fake audio bytes").toString("base64"),
      message: { audioMessage: { mimetype: "audio/ogg; codecs=opus" } }
    }
  };

  try {
    const first = await fetch(`${base}/v1/evolution/webhook/test-instance`, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
    assert.equal(first.status, 200);
    const second = await fetch(`${base}/v1/evolution/webhook/test-instance`, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
    assert.equal(second.status, 200);
    assert.equal(queue.jobs.length, 1);

    const digest = await fetch(`${base}/v1/groups/${encodeURIComponent("100000000000000001@g.us")}/digest?hours=24`, { headers });
    assert.equal(digest.status, 200);
    const digestBody: any = await digest.json();
    assert.equal(digestBody.ok, true);
    assert.equal(digestBody.messageCount, 1);
    assert.equal(digestBody.status.state, "partial");
    assert.equal("summary" in digestBody, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
});
