import crypto from "node:crypto";

export function nowIso(): string {
  return new Date().toISOString();
}

export function sha256(input: Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function safeFileName(input: string, fallback = "media.bin"): string {
  const raw = String(input || "").trim();
  const clean = raw.replace(/[^\w.\-]+/g, "_").slice(0, 180);
  return clean || fallback;
}

export function sanitizeText(input: string, limit = 5000): string {
  let text = String(input || "");
  text = text.replace(/```[\s\S]*?```/g, "[codigo removido]");
  text = text.replace(/https?:\/\/\S+/g, "[link removido]");
  text = text.replace(/Bearer\s+\S+/gi, "[auth removido]");
  text = text.replace(/sk-[a-zA-Z0-9-]{20,}/g, "[token removido]");
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removido]");
  return text.length > limit ? `${text.slice(0, limit)}... [truncado]` : text;
}

export function parseHours(value: unknown, fallback = 24): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(Math.trunc(n), 1), 24 * 30);
}

export function sinceEpochSeconds(hours: number): number {
  return Math.floor((Date.now() - hours * 3600 * 1000) / 1000);
}
