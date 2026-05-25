import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config.js";
import type { MediaStatus, NormalizedMessage } from "../types.js";
import { safeFileName, sha256 } from "../utils.js";

export interface ResolvedMedia {
  ok: true;
  filePath: string;
  mimeType?: string;
  sha256: string;
  bytes: number;
  source: "webhook_base64" | "media_url" | "evolution_get_base64";
}

export interface UnavailableMedia {
  ok: false;
  reason: string;
  status: Extract<MediaStatus, "unavailable" | "failed" | "rejected">;
}

type FetchWithTimeoutInit = RequestInit & { timeoutMs?: number };

function extensionFromMime(mime?: string): string {
  const value = String(mime || "").toLowerCase();
  if (value.includes("ogg")) return ".ogg";
  if (value.includes("opus")) return ".opus";
  if (value.includes("mpeg") || value.includes("mp3")) return ".mp3";
  if (value.includes("mp4")) return ".mp4";
  if (value.includes("webp")) return ".webp";
  if (value.includes("png")) return ".png";
  if (value.includes("jpeg") || value.includes("jpg")) return ".jpg";
  if (value.includes("pdf")) return ".pdf";
  return ".bin";
}

function rejected(reason: string): UnavailableMedia {
  return { ok: false, status: "rejected", reason };
}

function unavailable(reason: string): UnavailableMedia {
  return { ok: false, status: "unavailable", reason };
}

function failed(reason: string): UnavailableMedia {
  return { ok: false, status: "failed", reason };
}

function baseMime(value?: string): string {
  return String(value || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

export function isMimeTypeAllowed(mimeType: string | undefined, allowed: string[]): boolean {
  const mime = baseMime(mimeType);
  if (!mime) return false;
  return allowed.some((entry) => {
    const pattern = baseMime(entry);
    if (pattern.endsWith("/*")) return mime.startsWith(pattern.slice(0, -1));
    return mime === pattern;
  });
}

function ensureWithinByteLimit(config: AppConfig, bytes: number): UnavailableMedia | undefined {
  if (bytes > config.maxTranscriptionMediaBytes) {
    return rejected(`media exceeds MAX_TRANSCRIPTION_MEDIA_BYTES (${bytes} > ${config.maxTranscriptionMediaBytes})`);
  }
  return undefined;
}

async function fetchWithTimeout(url: string, init: FetchWithTimeoutInit = {}): Promise<Response> {
  const { timeoutMs = 30_000, ...requestInit } = init;
  const signal = AbortSignal.timeout(timeoutMs);
  return fetch(url, { ...requestInit, signal });
}

async function persistMedia(config: AppConfig, message: NormalizedMessage, bytes: Buffer, source: ResolvedMedia["source"]) {
  const limit = ensureWithinByteLimit(config, bytes.length);
  if (limit) return limit;
  const digest = sha256(bytes);
  const day = new Date(message.timestamp * 1000).toISOString().slice(0, 10);
  const fallback = `${message.id}${extensionFromMime(message.media?.mimetype)}`;
  const fileName = safeFileName(message.media?.fileName || fallback, fallback);
  const dir = path.join(config.mediaStorageDir, "media", day, message.chatJid.replace(/[^\w.-]+/g, "_"));
  const filePath = path.join(dir, `${message.id}-${fileName}`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, bytes);
  return {
    ok: true as const,
    filePath,
    mimeType: message.media?.mimetype,
    sha256: digest,
    bytes: bytes.length,
    source
  };
}

async function fetchEvolutionBase64(config: AppConfig, message: NormalizedMessage): Promise<Buffer | null> {
  if (!config.evolutionBaseUrl || !config.evolutionApiKey) return null;
  const instance = encodeURIComponent(message.instance || config.evolutionInstance);
  const urls = [
    `${config.evolutionBaseUrl}/chat/getBase64FromMediaMessage/${instance}`,
    `${config.evolutionBaseUrl}/message/getBase64FromMediaMessage/${instance}`
  ];

  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          apikey: config.evolutionApiKey,
          "content-type": "application/json"
        },
        body: JSON.stringify({ message: { key: (message.raw as any)?.data?.key || (message.raw as any)?.key, message: message.media?.rawMessage } }),
        timeoutMs: config.mediaDownloadTimeoutMs
      });
      if (!res.ok) continue;
      const data: any = await res.json();
      const encoded = data?.base64 || data?.data?.base64;
      if (encoded) return Buffer.from(encoded, "base64");
    } catch {
      continue;
    }
  }
  return null;
}

export async function resolveMedia(config: AppConfig, message: NormalizedMessage): Promise<ResolvedMedia | UnavailableMedia> {
  if (!message.media || message.mediaKind === "text") return unavailable("message has no media");
  if (!isMimeTypeAllowed(message.media.mimetype, config.transcriptionAllowedMimeTypes)) {
    return rejected(`mimetype is not allowed for transcription: ${message.media.mimetype || "missing"}`);
  }

  if (message.media.base64) {
    return persistMedia(config, message, Buffer.from(message.media.base64, "base64"), "webhook_base64");
  }

  let downloadFailure: string | undefined;
  if (message.media.mediaUrl) {
    try {
      const res = await fetchWithTimeout(message.media.mediaUrl, { timeoutMs: config.mediaDownloadTimeoutMs });
      if (res.ok) {
        const contentLength = Number(res.headers.get("content-length") || 0);
        const limit = contentLength > 0 ? ensureWithinByteLimit(config, contentLength) : undefined;
        if (limit) return limit;
        const bytes = Buffer.from(await res.arrayBuffer());
        return persistMedia(config, message, bytes, "media_url");
      }
    } catch (error) {
      if ((error as Error)?.name === "TimeoutError") {
        downloadFailure = `mediaUrl download timed out after ${config.mediaDownloadTimeoutMs}ms`;
      }
    }
  }

  const fromEvolution = await fetchEvolutionBase64(config, message);
  if (fromEvolution) {
    return persistMedia(config, message, fromEvolution, "evolution_get_base64");
  }

  if (downloadFailure) return failed(downloadFailure);
  return unavailable("media unavailable through webhook base64, mediaUrl, or public Evolution getBase64 endpoint");
}
