import assert from "node:assert/strict";
import test from "node:test";
import { buildCorpusDigest } from "../src/digest/corpus.js";

test("builds corpus digest without synthesis fields", () => {
  const digest = buildCorpusDigest("100000000000000001@g.us", 24, [
    {
      id: "1",
      instance: "test-instance",
      chatJid: "100000000000000001@g.us",
      fromMe: false,
      timestamp: Math.floor(Date.now() / 1000),
      text: "Mensagem sintética para corpus estruturado",
      mediaKind: "text",
      raw: {},
      receivedAt: new Date().toISOString()
    }
  ]);

  assert.equal(digest.ok, true);
  assert.equal(digest.messageCount, 1);
  assert.equal("summary" in digest, false);
  assert.equal("topics" in digest, false);
  assert.equal(digest.timeline[0].mediaStatus, "none");
});

test("builds expressive partial digest status without synthesis", () => {
  const digest = buildCorpusDigest("100000000000000001@g.us", 24, [
    {
      id: "audio-1",
      instance: "test-instance",
      chatJid: "100000000000000001@g.us",
      fromMe: false,
      timestamp: Math.floor(Date.now() / 1000),
      text: "",
      mediaKind: "audio",
      media: { mimetype: "audio/ogg" },
      raw: {},
      receivedAt: new Date().toISOString(),
      analysis: {
        instance: "test-instance",
        messageId: "audio-1",
        chatJid: "100000000000000001@g.us",
        status: "rejected",
        mediaKind: "audio",
        error: "synthetic limit refusal",
        updatedAt: new Date().toISOString()
      }
    }
  ]);

  assert.equal(digest.status.state, "partial");
  assert.equal(digest.status.reason, "partial_media_unavailable");
  assert.equal(digest.status.rejected, 1);
  assert.equal(digest.timeline[0].mediaStatus, "rejected");
});
