import assert from "node:assert/strict";
import test from "node:test";
import { buildDigest } from "../src/digest/summarizer.js";

test("builds deterministic digest from stored messages", () => {
  const digest = buildDigest("120@g.us", 24, [
    {
      id: "1",
      instance: "monitor",
      chatJid: "120@g.us",
      fromMe: false,
      timestamp: Math.floor(Date.now() / 1000),
      text: "Precisamos marcar a reunião e resolver pendente do contrato",
      mediaKind: "text",
      raw: {},
      receivedAt: new Date().toISOString()
    }
  ]);

  assert.equal(digest.ok, true);
  assert.equal(digest.messageCount, 1);
  assert.equal(digest.pending.length, 1);
  assert.equal(digest.timeline[0].mediaStatus, "none");
});
