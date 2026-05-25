import path from "node:path";

export interface AppConfig {
  port: number;
  apiToken: string;
  evolutionBaseUrl: string;
  evolutionApiKey: string;
  evolutionInstance: string;
  mediaStorageDir: string;
  transcriberProvider: string;
  sonioxApiKey?: string;
  sonioxModel: string;
  visionProvider: string;
  visionBaseUrl?: string;
  visionApiKey?: string;
  visionModel: string;
  openclawCompat: boolean;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

export function loadConfig(env = process.env): AppConfig {
  const mediaStorageDir = path.resolve(env.MEDIA_STORAGE_DIR || "./data");
  return {
    port: Number(env.PORT || 3897),
    apiToken: env.DIGEST_API_TOKEN || "",
    evolutionBaseUrl: String(env.EVOLUTION_BASE_URL || "").replace(/\/+$/, ""),
    evolutionApiKey: env.EVOLUTION_API_KEY || "",
    evolutionInstance: env.EVOLUTION_INSTANCE || "monitor",
    mediaStorageDir,
    transcriberProvider: env.TRANSCRIBER_PROVIDER || "soniox",
    sonioxApiKey: env.SONIOX_API_KEY || undefined,
    sonioxModel: env.SONIOX_MODEL || "stt-async-v4",
    visionProvider: env.VISION_PROVIDER || "metadata",
    visionBaseUrl: env.VISION_BASE_URL || env.OPENAI_BASE_URL || undefined,
    visionApiKey: env.VISION_API_KEY || env.OPENAI_API_KEY || undefined,
    visionModel: env.VISION_MODEL || "gpt-4.1-mini",
    openclawCompat: bool(env.OPENCLAW_COMPAT, true)
  };
}
