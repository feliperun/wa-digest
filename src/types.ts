export type MediaKind = "text" | "audio" | "image" | "video" | "document" | "unknown";

export type MediaStatus = "none" | "processing" | "transcribed" | "metadata_only" | "unavailable" | "failed";

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

export interface SaveMessageResult {
  message: StoredMessage;
  inserted: boolean;
}

export interface MediaAnalysis {
  instance: string;
  messageId: string;
  chatJid: string;
  status: MediaStatus;
  mediaKind: MediaKind;
  storagePath?: string;
  transcript?: string;
  visualDescription?: string;
  ocrText?: string;
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
  status: {
    state: "complete" | "partial";
    processing: number;
    transcribed: number;
    metadataOnly: number;
    unavailable: number;
    failed: number;
  };
  timeline: Array<{
    id: string;
    instance: string;
    timestamp: number;
    senderName?: string;
    participantJid?: string;
    fromMe: boolean;
    text: string;
    mediaKind: MediaKind;
    mediaStatus: MediaStatus;
    media?: {
      mimetype?: string;
      fileName?: string;
      storagePath?: string;
      source?: string;
      sha256?: string;
      bytes?: number;
      error?: string;
    };
    transcription?: {
      status: MediaStatus;
      text?: string;
      provider?: string;
      model?: string;
      error?: string;
    };
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
