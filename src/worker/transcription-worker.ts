import { spawn } from "node:child_process";
import type { AppConfig } from "../config.js";
import { resolveMedia } from "../media/resolver.js";
import type { PgStore } from "../store/pg-store.js";
import { TranscriberController } from "../transcription/controller.js";
import type { TranscriptionJobData } from "../queue/transcription-queue.js";

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

export class TranscriptionWorker {
  constructor(
    private readonly config: AppConfig,
    private readonly store: PgStore,
    private readonly transcriber = new TranscriberController(config)
  ) {}

  async process(job: TranscriptionJobData): Promise<void> {
    const message = await this.store.getMessage(job.instance, job.messageId);
    if (!message) throw new Error(`message not found: ${job.instance}/${job.messageId}`);

    if (message.mediaKind !== "audio" && message.mediaKind !== "video") {
      await this.store.markMediaStatus(job.instance, job.messageId, "metadata_only");
      return;
    }

    await this.store.markMediaStatus(job.instance, job.messageId, "processing");
    await this.store.upsertTranscriptionStatus(job.instance, job.messageId, "processing");

    const resolved = await resolveMedia(this.config, message);
    if (!resolved.ok) {
      await this.store.markMediaStatus(job.instance, job.messageId, "unavailable", resolved.reason);
      await this.store.upsertTranscriptionStatus(job.instance, job.messageId, "unavailable", resolved.reason);
      return;
    }

    await this.store.saveMediaResolved({
      instance: job.instance,
      messageId: job.messageId,
      storagePath: resolved.filePath,
      source: resolved.source,
      sha256: resolved.sha256,
      bytes: resolved.bytes
    });

    const filePath = message.mediaKind === "video" ? await extractVideoAudio(resolved.filePath) : resolved.filePath;
    if (!filePath) {
      const reason = "video audio track could not be extracted";
      await this.store.markMediaStatus(job.instance, job.messageId, "failed", reason);
      await this.store.upsertTranscriptionStatus(job.instance, job.messageId, "failed", reason);
      throw new Error(reason);
    }

    try {
      const out = await this.transcriber.transcribe({
        filePath,
        mimeType: message.mediaKind === "video" ? "audio/mp4" : resolved.mimeType,
        languageHints: ["pt"],
        diarization: true,
        context: message.text
      });
      await this.store.saveTranscriptionResult({
        instance: job.instance,
        messageId: job.messageId,
        provider: out.provider,
        model: out.model,
        transcript: out.text,
        segments: out.segments,
        raw: out.raw
      });
      await this.store.markMediaStatus(job.instance, job.messageId, "transcribed");
    } catch (error) {
      const messageText = String((error as Error)?.message || error);
      await this.store.markMediaStatus(job.instance, job.messageId, "failed", messageText);
      await this.store.upsertTranscriptionStatus(job.instance, job.messageId, "failed", messageText);
      throw error;
    }
  }
}
