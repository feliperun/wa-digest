import path from "node:path";

export interface AppConfig {
  port: number;
  apiToken: string;
  evolutionBaseUrl: string;
  evolutionApiKey: string;
  evolutionInstance: string;
  databaseUrl: string;
  mediaStorageDir: string;
  transcriberProvider: string;
  sonioxApiKey?: string;
  sonioxModel: string;
  visionProvider: string;
  visionBaseUrl?: string;
  visionApiKey?: string;
  visionModel: string;
  maxConcurrentTranscriptions: number;
  maxTranscriptionMediaBytes: number;
  mediaDownloadTimeoutMs: number;
  transcriptionAllowedMimeTypes: string[];
  maxTranscriptionMinutesPerDay: number;
  openclawCompat: boolean;
  monitorWebhookUrl: string;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value || fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function nonNegativeNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value || fallback);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function csv(value: string | undefined, fallback: string[]): string[] {
  const parsed = String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

export function loadConfig(env = process.env): AppConfig {
  const mediaStorageDir = path.resolve(env.MEDIA_STORAGE_DIR || "./data");
  return {
    port: Number(env.PORT || 3897),
    apiToken: env.DIGEST_API_TOKEN || "",
    evolutionBaseUrl: String(env.EVOLUTION_BASE_URL || "").replace(/\/+$/, ""),
    evolutionApiKey: env.EVOLUTION_API_KEY || "",
    evolutionInstance: env.EVOLUTION_INSTANCE || "monitor",
    databaseUrl: env.DATABASE_URL || "",
    mediaStorageDir,
    transcriberProvider: env.TRANSCRIBER_PROVIDER || "soniox",
    sonioxApiKey: env.SONIOX_API_KEY || undefined,
    sonioxModel: env.SONIOX_MODEL || "stt-async-v4",
    visionProvider: env.VISION_PROVIDER || "metadata",
    visionBaseUrl: env.VISION_BASE_URL || env.OPENAI_BASE_URL || undefined,
    visionApiKey: env.VISION_API_KEY || env.OPENAI_API_KEY || undefined,
    visionModel: env.VISION_MODEL || "gpt-4.1-mini",
    maxConcurrentTranscriptions: positiveInteger(env.MAX_CONCURRENT_TRANSCRIPTIONS, 2),
    maxTranscriptionMediaBytes: positiveInteger(env.MAX_TRANSCRIPTION_MEDIA_BYTES, 25 * 1024 * 1024),
    mediaDownloadTimeoutMs: positiveInteger(env.MEDIA_DOWNLOAD_TIMEOUT_MS, 30_000),
    transcriptionAllowedMimeTypes: csv(env.TRANSCRIPTION_ALLOWED_MIME_TYPES, ["audio/*", "video/*"]),
    maxTranscriptionMinutesPerDay: nonNegativeNumber(env.MAX_TRANSCRIPTION_MINUTES_PER_DAY, 0),
    openclawCompat: bool(env.OPENCLAW_COMPAT, true),
    monitorWebhookUrl: env.MONITOR_WEBHOOK_URL || ""
  };
}
