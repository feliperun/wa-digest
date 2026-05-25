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
