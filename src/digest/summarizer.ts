import type { DigestResponse, MediaAnalysis, StoredMessage } from "../types.js";
import { sanitizeText } from "../utils.js";

type MessageWithAnalysis = StoredMessage & { analysis?: MediaAnalysis };

function bulletCandidates(messages: MessageWithAnalysis[], matcher: RegExp): string[] {
  const out: string[] = [];
  for (const message of messages) {
    const text = [message.text, message.analysis?.transcript, message.analysis?.visualDescription]
      .filter(Boolean)
      .join(" ");
    if (!matcher.test(text)) continue;
    out.push(`${message.senderName || "contato"}: ${sanitizeText(text, 220)}`);
    if (out.length >= 8) break;
  }
  return out;
}

function topicFromText(text: string): string {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 5 && !["mensagem", "audio", "video", "imagem", "grupo", "sobre"].includes(word));
  return words[0] || "conversa";
}

export function buildDigest(chatJid: string, hours: number, messages: MessageWithAnalysis[]): DigestResponse {
  const combinedText = messages
    .map((message) => [message.text, message.analysis?.transcript, message.analysis?.visualDescription].filter(Boolean).join(" "))
    .filter(Boolean);
  const counts = new Map<string, number>();
  for (const text of combinedText) {
    const topic = topicFromText(text);
    counts.set(topic, (counts.get(topic) || 0) + 1);
  }
  const topics = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([topic]) => topic);

  const decisions = bulletCandidates(messages, /\b(decid|combin|fechad|aprov|definid|resolvid)/i);
  const pending = bulletCandidates(messages, /\b(pendente|precisa|falta|lembr|cobrar|resolver|enviar|mandar|marcar|agenda)/i);
  const mediaCount = messages.filter((message) => message.mediaKind !== "text").length;
  const unavailable = messages.filter((message) => message.analysis?.status === "unavailable" || message.analysis?.status === "failed").length;
  const summaryParts = [
    `Resumo de ${messages.length} mensagens em ${hours}h.`,
    topics.length ? `Tópicos principais: ${topics.join(", ")}.` : "",
    mediaCount ? `Mídias analisadas/registradas: ${mediaCount}${unavailable ? ` (${unavailable} indisponíveis ou com falha)` : ""}.` : ""
  ].filter(Boolean);

  return {
    ok: true,
    chatJid,
    hours,
    messageCount: messages.length,
    mediaCount,
    generatedAt: new Date().toISOString(),
    summary: sanitizeText(summaryParts.join(" ")),
    topics,
    decisions,
    pending,
    timeline: messages.map((message) => ({
      id: message.id,
      timestamp: message.timestamp,
      senderName: message.senderName,
      fromMe: message.fromMe,
      text: sanitizeText(message.text, 1000),
      mediaKind: message.mediaKind,
      mediaStatus: message.analysis?.status || (message.mediaKind === "text" ? "none" : "pending"),
      transcript: message.analysis?.transcript ? sanitizeText(message.analysis.transcript, 2000) : undefined,
      visualDescription: message.analysis?.visualDescription
        ? sanitizeText(message.analysis.visualDescription, 1000)
        : undefined,
      error: message.analysis?.error
    }))
  };
}
