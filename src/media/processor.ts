import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config.js";
import type { MediaAnalysis, NormalizedMessage } from "../types.js";
import { TranscriberController } from "../transcription/controller.js";
import { nowIso } from "../utils.js";
import { MediaInterpreterController } from "./interpreter.js";
import { resolveMedia } from "./resolver.js";

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `${command} exited with ${code}`));
    });
  });
}

async function extractVideoAudio(videoPath: string): Promise<string | undefined> {
  const out = `${videoPath}.audio.m4a`;
  try {
    await run("ffmpeg", ["-y", "-i", videoPath, "-vn", "-acodec", "copy", out]);
    return out;
  } catch {
    try {
      await run("ffmpeg", ["-y", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", out]);
      return out;
    } catch {
      return undefined;
    }
  }
}

async function extractVideoFrame(videoPath: string): Promise<string | undefined> {
  const out = `${videoPath}.frame.jpg`;
  try {
    await run("ffmpeg", ["-y", "-ss", "00:00:01", "-i", videoPath, "-frames:v", "1", out]);
    return out;
  } catch {
    return undefined;
  }
}

function describeStaticMedia(message: NormalizedMessage, storagePath: string): string {
  const bits = [
    `${message.mediaKind} recebida`,
    message.media?.caption ? `legenda: ${message.media.caption}` : "",
    message.media?.mimetype ? `mime: ${message.media.mimetype}` : "",
    `arquivo: ${path.basename(storagePath)}`
  ].filter(Boolean);
  return bits.join("; ");
}

export class MediaProcessor {
  constructor(
    private readonly config: AppConfig,
    private readonly transcriber = new TranscriberController(config),
    private readonly interpreter = new MediaInterpreterController(config)
  ) {}

  async process(message: NormalizedMessage): Promise<MediaAnalysis> {
    if (message.mediaKind === "text") {
      return {
        messageId: message.id,
        chatJid: message.chatJid,
        status: "none",
        mediaKind: "text",
        updatedAt: nowIso()
      };
    }

    const resolved = await resolveMedia(this.config, message);
    if (!resolved.ok) {
      return {
        messageId: message.id,
        chatJid: message.chatJid,
        status: "unavailable",
        mediaKind: message.mediaKind,
        error: resolved.reason,
        updatedAt: nowIso()
      };
    }

    try {
      const artifacts: Record<string, string> = { media: resolved.filePath };
      let transcript = "";
      let visualDescription = "";

      if (message.mediaKind === "audio") {
        const out = await this.transcriber.transcribe({
          filePath: resolved.filePath,
          mimeType: resolved.mimeType,
          languageHints: ["pt"],
          diarization: true,
          context: message.text
        });
        transcript = out.text;
      } else if (message.mediaKind === "video") {
        const audioPath = await extractVideoAudio(resolved.filePath);
        const framePath = await extractVideoFrame(resolved.filePath);
        if (audioPath) {
          artifacts.audio = audioPath;
          const out = await this.transcriber.transcribe({
            filePath: audioPath,
            mimeType: "audio/mp4",
            languageHints: ["pt"],
            diarization: true,
            context: message.text
          });
          transcript = out.text;
        }
        if (framePath) {
          artifacts.frame = framePath;
          const interpreted = await this.interpreter.interpret({
            filePath: framePath,
            mimeType: "image/jpeg",
            caption: message.media?.caption,
            context: message.text
          });
          visualDescription = interpreted.description;
        } else {
          visualDescription = describeStaticMedia(message, resolved.filePath);
        }
      } else if (message.mediaKind === "image") {
        const interpreted = await this.interpreter.interpret({
          filePath: resolved.filePath,
          mimeType: resolved.mimeType,
          caption: message.media?.caption,
          context: message.text
        });
        visualDescription = interpreted.description;
      } else {
        visualDescription = describeStaticMedia(message, resolved.filePath);
      }

      return {
        messageId: message.id,
        chatJid: message.chatJid,
        status: "processed",
        mediaKind: message.mediaKind,
        storagePath: resolved.filePath,
        transcript,
        visualDescription,
        ocrText: "",
        summary: [message.media?.caption, transcript, visualDescription].filter(Boolean).join("\n").trim(),
        artifacts,
        modelMeta: { mediaSource: resolved.source, sha256: resolved.sha256, bytes: resolved.bytes },
        updatedAt: nowIso()
      };
    } catch (error) {
      await fs.access(resolved.filePath).catch(() => undefined);
      return {
        messageId: message.id,
        chatJid: message.chatJid,
        status: "failed",
        mediaKind: message.mediaKind,
        storagePath: resolved.filePath,
        error: String((error as Error)?.message || error),
        updatedAt: nowIso()
      };
    }
  }
}
