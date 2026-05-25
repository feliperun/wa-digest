export type MediaKind = "text" | "audio" | "image" | "video" | "document" | "unknown";

export type MediaStatus = "none" | "pending" | "available" | "processed" | "unavailable" | "failed";

export interface NormalizedMessage {
  id: string;
  instance: string;
  chatJid: string;
  participantJid?: string;
  senderName?: string;
  fromMe: boolean;
  timestamp: number;
  text: string;
  mediaKind: MediaKind;
  media?: {
    mimetype?: string;
    fileName?: string;
    caption?: string;
    base64?: string;
    mediaUrl?: string;
    rawMessage?: unknown;
  };
  raw: unknown;
}

export interface StoredMessage extends NormalizedMessage {
  receivedAt: string;
}

export interface MediaAnalysis {
  messageId: string;
  chatJid: string;
  status: MediaStatus;
  mediaKind: MediaKind;
  storagePath?: string;
  transcript?: string;
  visualDescription?: string;
  ocrText?: string;
  summary?: string;
  artifacts?: Record<string, string>;
  modelMeta?: Record<string, unknown>;
  error?: string;
  updatedAt: string;
}

export interface DigestResponse {
  ok: true;
  chatJid: string;
  hours: number;
  messageCount: number;
  mediaCount: number;
  generatedAt: string;
  summary: string;
  topics: string[];
  decisions: string[];
  pending: string[];
  timeline: Array<{
    id: string;
    timestamp: number;
    senderName?: string;
    fromMe: boolean;
    text: string;
    mediaKind: MediaKind;
    mediaStatus: MediaStatus;
    transcript?: string;
    visualDescription?: string;
    error?: string;
  }>;
}

export interface TranscribeInput {
  filePath: string;
  mimeType?: string;
  languageHints?: string[];
  diarization?: boolean;
  context?: string;
}

export interface TranscribeOutput {
  text: string;
  segments?: Array<{
    start?: number;
    end?: number;
    speaker?: string;
    text: string;
  }>;
  provider: string;
  model?: string;
  raw?: unknown;
}

export interface InterpretMediaInput {
  filePath: string;
  mimeType?: string;
  caption?: string;
  context?: string;
}

export interface InterpretMediaOutput {
  description: string;
  ocrText?: string;
  provider: string;
  model?: string;
  raw?: unknown;
}
