import express from "express";
import { loadConfig } from "./config.js";
import { buildDigest } from "./digest/summarizer.js";
import { isMessageUpsert, normalizeEvolutionWebhook } from "./evolution/parser.js";
import { MediaProcessor } from "./media/processor.js";
import { JsonStore } from "./store/json-store.js";
import { parseHours, sanitizeText, sinceEpochSeconds } from "./utils.js";

export function createApp() {
  const config = loadConfig();
  const app = express();
  const store = new JsonStore(config.mediaStorageDir);
  const processor = new MediaProcessor(config);

  app.use(express.json({ limit: "50mb" }));

  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (req.path === "/healthz") return next();
    if (!config.apiToken) return res.status(500).json({ ok: false, error: "DIGEST_API_TOKEN is not configured" });
    const auth = req.header("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (token !== config.apiToken) return res.status(401).json({ ok: false, error: "unauthorized" });
    return next();
  }

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, service: "evolution-media-digest", ts: new Date().toISOString() });
  });

  app.use(requireAuth);

  app.post("/v1/evolution/webhook/:instance", async (req, res) => {
    try {
      if (!isMessageUpsert(req.body)) return res.json({ ok: true, ignored: true });
      const message = normalizeEvolutionWebhook(req.body, req.params.instance);
      if (!message) return res.status(400).json({ ok: false, error: "unsupported Evolution webhook payload" });

      const stored = await store.saveMessage(message);
      let analysis = undefined;
      if (message.mediaKind !== "text") {
        analysis = await processor.process(message);
        await store.saveAnalysis(analysis);
      }

      return res.json({
        ok: true,
        message: {
          id: stored.id,
          chatJid: stored.chatJid,
          timestamp: stored.timestamp,
          text: sanitizeText(stored.text),
          mediaKind: stored.mediaKind
        },
        analysis
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: String((error as Error)?.message || error) });
    }
  });

  app.get("/v1/groups", async (_req, res) => {
    try {
      const chats = await store.listChats();
      return res.json({
        ok: true,
        groups: chats.filter((chat) => chat.jid.endsWith("@g.us"))
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: String((error as Error)?.message || error) });
    }
  });

  app.get("/v1/groups/:jid/digest", async (req, res) => {
    try {
      const hours = parseHours(req.query.hours, 24);
      const jid = decodeURIComponent(req.params.jid);
      const messages = await store.getMessages(jid, sinceEpochSeconds(hours));
      return res.json(buildDigest(jid, hours, messages));
    } catch (error) {
      return res.status(500).json({ ok: false, error: String((error as Error)?.message || error) });
    }
  });

  app.get("/v1/chats/:jid/timeline", async (req, res) => {
    try {
      const hours = parseHours(req.query.hours, 24);
      const jid = decodeURIComponent(req.params.jid);
      const messages = await store.getMessages(jid, sinceEpochSeconds(hours));
      return res.json({
        ok: true,
        chatJid: jid,
        hours,
        count: messages.length,
        timeline: buildDigest(jid, hours, messages).timeline
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: String((error as Error)?.message || error) });
    }
  });

  app.get("/v1/messages/:messageId/analysis", async (req, res) => {
    try {
      const analysis = await store.getAnalysis(req.params.messageId);
      if (!analysis) return res.status(404).json({ ok: false, error: "analysis not found" });
      return res.json({ ok: true, analysis });
    } catch (error) {
      return res.status(500).json({ ok: false, error: String((error as Error)?.message || error) });
    }
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  createApp().listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`evolution-media-digest listening on ${config.port}`);
  });
}
