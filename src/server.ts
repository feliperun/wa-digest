import express from "express";
import { loadConfig } from "./config.js";
import type { AppConfig } from "./config.js";
import { createPgPool } from "./db/pool.js";
import { buildCorpusDigest } from "./digest/corpus.js";
import { isMessageUpsert, normalizeEvolutionWebhook } from "./evolution/parser.js";
import { PgBossTranscriptionQueue, type TranscriptionQueue } from "./queue/transcription-queue.js";
import { PgStore } from "./store/pg-store.js";
import { parseHours, sanitizeText, sinceEpochSeconds } from "./utils.js";

type Store = Pick<PgStore, "saveMessage" | "listChats" | "getMessages" | "getAnalysisByMessageId">;

export interface AppDeps {
  config?: AppConfig;
  store?: Store;
  queue?: TranscriptionQueue;
}

export function createApp(deps: AppDeps = {}) {
  const config = deps.config || loadConfig();
  const app = express();
  const pool = deps.store ? undefined : createPgPool(config);
  const store = deps.store || new PgStore(pool!);
  const queue = deps.queue || new PgBossTranscriptionQueue(config);

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
    res.json({ ok: true, service: "wa-digest", ts: new Date().toISOString() });
  });

  app.use(requireAuth);

  app.post("/v1/evolution/webhook/:instance", async (req, res) => {
    try {
      if (!isMessageUpsert(req.body)) return res.json({ ok: true, ignored: true });
      const message = normalizeEvolutionWebhook(req.body, req.params.instance);
      if (!message) return res.status(400).json({ ok: false, error: "unsupported Evolution webhook payload" });

      const stored = await store.saveMessage(message);
      let jobId: string | null = null;
      if (stored.inserted && (message.mediaKind === "audio" || message.mediaKind === "video")) {
        jobId = await queue.enqueueTranscription(message);
      }

      return res.json({
        ok: true,
        queued: Boolean(jobId),
        message: {
          id: stored.message.id,
          chatJid: stored.message.chatJid,
          timestamp: stored.message.timestamp,
          text: sanitizeText(stored.message.text),
          mediaKind: stored.message.mediaKind
        }
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
      return res.json(buildCorpusDigest(jid, hours, messages));
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
        timeline: buildCorpusDigest(jid, hours, messages).timeline
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: String((error as Error)?.message || error) });
    }
  });

  app.get("/v1/messages/:messageId/analysis", async (req, res) => {
    try {
      const analysis = await store.getAnalysisByMessageId(req.params.messageId);
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
    console.log(`wa-digest listening on ${config.port}`);
  });
}
