import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEvolutionWebhook } from "../src/evolution/parser.js";

test("normalizes Evolution text webhook", () => {
  const message = normalizeEvolutionWebhook({
    event: "MESSAGES_UPSERT",
    instance: "monitor",
    data: {
      key: { id: "abc", remoteJid: "120@g.us", participant: "5548@s.whatsapp.net", fromMe: false },
      pushName: "Felipe",
      messageTimestamp: 1710000000,
      message: { conversation: "olá grupo" }
    }
  });

  assert.equal(message?.id, "abc");
  assert.equal(message?.chatJid, "120@g.us");
  assert.equal(message?.senderName, "Felipe");
  assert.equal(message?.text, "olá grupo");
  assert.equal(message?.mediaKind, "text");
});

test("normalizes Evolution audio webhook with base64", () => {
  const message = normalizeEvolutionWebhook({
    event: "MESSAGES_UPSERT",
    data: {
      key: { id: "audio1", remoteJid: "120@g.us", participant: "5548@s.whatsapp.net" },
      messageTimestamp: 1710000000,
      base64: Buffer.from("fake audio").toString("base64"),
      message: { audioMessage: { mimetype: "audio/ogg; codecs=opus" } }
    }
  });

  assert.equal(message?.mediaKind, "audio");
  assert.match(message?.media?.base64 || "", /^[A-Za-z0-9+/=]+$/);
});
