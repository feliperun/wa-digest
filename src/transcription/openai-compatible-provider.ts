import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../config.js";
import type { TranscribeInput, TranscribeOutput } from "../types.js";
import type { TranscriberProvider } from "./controller.js";

export class OpenAiCompatibleTranscriberProvider implements TranscriberProvider {
  readonly name = "openai-compatible";

  constructor(private readonly config: AppConfig) {}

  async transcribe(input: TranscribeInput): Promise<TranscribeOutput> {
    const baseUrl = String(process.env.TRANSCRIBER_BASE_URL || process.env.OPENAI_BASE_URL || "").replace(/\/+$/, "");
    const apiKey = process.env.TRANSCRIBER_API_KEY || process.env.OPENAI_API_KEY || "";
    const model = process.env.TRANSCRIBER_MODEL || process.env.OPENAI_AUDIO_MODEL || "whisper-1";
    if (!baseUrl || !apiKey) throw new Error("TRANSCRIBER_BASE_URL and TRANSCRIBER_API_KEY are required");

    const bytes = await fs.readFile(input.filePath);
    const form = new FormData();
    form.set("file", new Blob([bytes], { type: input.mimeType || "application/octet-stream" }), path.basename(input.filePath));
    form.set("model", model);
    form.set("response_format", "json");
    if (input.languageHints?.[0]) form.set("language", input.languageHints[0]);

    const res = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form
    });
    if (!res.ok) throw new Error(`transcriber_http_${res.status}: ${await res.text().catch(() => "")}`);
    const data: any = await res.json();
    return {
      text: String(data?.text || "").trim(),
      provider: this.name,
      model,
      raw: data
    };
  }
}
