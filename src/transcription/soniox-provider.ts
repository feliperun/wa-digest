import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config.js";
import type { TranscribeInput, TranscribeOutput } from "../types.js";
import type { TranscriberProvider } from "./provider.js";

export class SonioxTranscriberProvider implements TranscriberProvider {
  readonly name = "soniox";

  constructor(private readonly config: AppConfig) {}

  async transcribe(input: TranscribeInput): Promise<TranscribeOutput> {
    const { SonioxNodeClient } = await import("@soniox/node");
    const client = new SonioxNodeClient({
      api_key: this.config.sonioxApiKey || process.env.SONIOX_API_KEY
    });
    const audio = await fs.readFile(input.filePath);
    const transcription = await client.stt.transcribe({
      model: this.config.sonioxModel,
      file: audio,
      filename: path.basename(input.filePath),
      wait: true
    } as any);
    const text = String(transcription?.transcript?.text || "").trim();
    return {
      text,
      provider: this.name,
      model: this.config.sonioxModel,
      raw: transcription
    };
  }
}
