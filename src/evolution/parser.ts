import type { MediaKind, NormalizedMessage } from "../types.js";

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function digitsFromJid(jid: unknown): string {
  return String(jid || "").split("@")[0].replace(/\D/g, "");
}

function getMessageContainer(payload: any): any {
  if (payload?.data?.key && payload?.data?.message) return payload.data;
  if (payload?.message?.key && payload?.message?.message) return payload.message;
  if (payload?.key && payload?.message) return payload;
  return payload?.data || payload;
}

function getMediaMessage(message: any): { kind: MediaKind; value?: any } {
  if (message?.audioMessage) return { kind: "audio", value: message.audioMessage };
  if (message?.imageMessage) return { kind: "image", value: message.imageMessage };
  if (message?.videoMessage) return { kind: "video", value: message.videoMessage };
  if (message?.documentMessage) return { kind: "document", value: message.documentMessage };
  return { kind: "text" };
}

function extractText(message: any, mediaValue: any): string {
  return firstString(
    message?.conversation,
    message?.extendedTextMessage?.text,
    message?.buttonsResponseMessage?.selectedDisplayText,
    message?.listResponseMessage?.title,
    mediaValue?.caption
  );
}

function extractMedia(payload: any, message: any, mediaValue: any) {
  if (!mediaValue) return undefined;
  return {
    mimetype: firstString(mediaValue.mimetype, payload?.data?.mimetype, payload?.mimetype),
    fileName: firstString(mediaValue.fileName, mediaValue.fileNameWithExtension, payload?.data?.fileName),
    caption: firstString(mediaValue.caption),
    base64: firstString(payload?.data?.base64, payload?.base64, mediaValue.base64),
    mediaUrl: firstString(mediaValue.url, mediaValue.mediaUrl, payload?.data?.mediaUrl, payload?.mediaUrl),
    rawMessage: message
  };
}

export function normalizeEvolutionWebhook(payload: unknown, fallbackInstance = "monitor"): NormalizedMessage | null {
  const anyPayload: any = payload || {};
  const container = getMessageContainer(anyPayload);
  const key = container?.key || {};
  const message = container?.message || {};
  const id = firstString(key.id, container?.id, anyPayload?.id);
  const chatJid = firstString(key.remoteJid, container?.remoteJid, anyPayload?.remoteJid);
  if (!id || !chatJid) return null;

  const media = getMediaMessage(message);
  const text = extractText(message, media.value);
  const participantJid = firstString(key.participant, chatJid.endsWith("@g.us") ? undefined : chatJid);
  const timestamp = Number(container?.messageTimestamp || anyPayload?.data?.messageTimestamp || Math.floor(Date.now() / 1000));

  return {
    id,
    instance: firstString(anyPayload?.instance, anyPayload?.data?.instance, fallbackInstance),
    chatJid,
    participantJid,
    senderName: firstString(container?.pushName, anyPayload?.data?.pushName, anyPayload?.pushName, digitsFromJid(participantJid)),
    fromMe: key.fromMe === true || key.fromMe === "true",
    timestamp: Number.isFinite(timestamp) ? timestamp : Math.floor(Date.now() / 1000),
    text,
    mediaKind: media.kind,
    media: extractMedia(anyPayload, message, media.value),
    raw: payload
  };
}

export function isMessageUpsert(payload: unknown): boolean {
  const event = String((payload as any)?.event || (payload as any)?.data?.event || "").toUpperCase();
  return !event || event === "MESSAGES_UPSERT";
}
