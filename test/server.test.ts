import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("ingests webhook and returns group digest", async () => {
  process.env.DIGEST_API_TOKEN = "test-token";
  process.env.MEDIA_STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "emd-"));
  process.env.TRANSCRIBER_PROVIDER = "noop";
  process.env.EVOLUTION_BASE_URL = "http://127.0.0.1:9";
  process.env.EVOLUTION_API_KEY = "test";

  const { createApp } = await import("../src/server.js");
  const app = createApp();
  const server = app.listen(0);
  const address = server.address();
  assert.equal(typeof address, "object");
  const base = `http://127.0.0.1:${address && typeof address === "object" ? address.port : 0}`;
  const headers = {
    authorization: "Bearer test-token",
    "content-type": "application/json"
  };

  try {
    const webhook = await fetch(`${base}/v1/evolution/webhook/monitor`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        event: "MESSAGES_UPSERT",
        instance: "monitor",
        data: {
          key: { id: "m1", remoteJid: "120@g.us", participant: "5548@s.whatsapp.net", fromMe: false },
          pushName: "Pessoa",
          messageTimestamp: Math.floor(Date.now() / 1000),
          message: { conversation: "Vamos combinar a entrega amanhã" }
        }
      })
    });
    assert.equal(webhook.status, 200);

    const digest = await fetch(`${base}/v1/groups/${encodeURIComponent("120@g.us")}/digest?hours=24`, { headers });
    assert.equal(digest.status, 200);
    const body: any = await digest.json();
    assert.equal(body.ok, true);
    assert.equal(body.messageCount, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
