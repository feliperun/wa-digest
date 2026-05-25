import type { DigestResponse, MediaAnalysis, MediaStatus, StoredMessage } from "../types.js";
import { sanitizeText } from "../utils.js";

type MessageWithAnalysis = StoredMessage & { analysis?: MediaAnalysis };

function mediaStatus(message: MessageWithAnalysis): MediaStatus {
  if (message.mediaKind === "text") return "none";
  return message.analysis?.status || "processing";
}

export function buildCorpusDigest(chatJid: string, hours: number, messages: MessageWithAnalysis[]): DigestResponse {
  const counts = {
    processing: 0,
    transcribed: 0,
    metadataOnly: 0,
    unavailable: 0,
    failed: 0,
    rejected: 0
  };

  for (const message of messages) {
    const status = mediaStatus(message);
    if (status === "processing") counts.processing += 1;
    if (status === "transcribed") counts.transcribed += 1;
    if (status === "metadata_only") counts.metadataOnly += 1;
    if (status === "unavailable") counts.unavailable += 1;
    if (status === "failed") counts.failed += 1;
    if (status === "rejected") counts.rejected += 1;
  }

  const reason =
    counts.processing > 0
      ? "processing"
      : counts.failed > 0
        ? "failed_items"
        : counts.unavailable > 0 || counts.rejected > 0
          ? "partial_media_unavailable"
          : undefined;

  return {
    ok: true,
    chatJid,
    hours,
    messageCount: messages.length,
    mediaCount: messages.filter((message) => message.mediaKind !== "text").length,
    generatedAt: new Date().toISOString(),
    status: {
      state: reason ? "partial" : "complete",
      reason,
      ...counts
    },
    timeline: messages.map((message) => {
      const status = mediaStatus(message);
      const bytes = message.analysis?.modelMeta?.bytes;
      const source = message.analysis?.modelMeta?.source;
      const sha256 = message.analysis?.modelMeta?.sha256;
      return {
        id: message.id,
        instance: message.instance,
        timestamp: message.timestamp,
        senderName: message.senderName,
        participantJid: message.participantJid,
        fromMe: message.fromMe,
        text: sanitizeText(message.text, 1000),
        mediaKind: message.mediaKind,
        mediaStatus: status,
        media:
          message.mediaKind === "text"
            ? undefined
            : {
                mimetype: message.media?.mimetype,
                fileName: message.media?.fileName,
                storagePath: message.analysis?.storagePath,
                source: typeof source === "string" ? source : undefined,
                sha256: typeof sha256 === "string" ? sha256 : undefined,
                bytes: typeof bytes === "number" ? bytes : undefined,
                error: message.analysis?.error
              },
        transcription:
          message.mediaKind === "audio" || message.mediaKind === "video"
            ? {
                status,
                text: message.analysis?.transcript ? sanitizeText(message.analysis.transcript, 4000) : undefined,
                provider:
                  typeof message.analysis?.modelMeta?.provider === "string"
                    ? message.analysis.modelMeta.provider
                    : undefined,
                model: typeof message.analysis?.modelMeta?.model === "string" ? message.analysis.modelMeta.model : undefined,
                error: message.analysis?.error
              }
            : undefined
      };
    })
  };
}
