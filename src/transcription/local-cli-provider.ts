import { spawn } from "node:child_process";
import type { TranscribeInput, TranscribeOutput } from "../types.js";
import type { TranscriberProvider } from "./provider.js";

export class LocalCliTranscriberProvider implements TranscriberProvider {
  readonly name = "local-cli";

  async transcribe(input: TranscribeInput): Promise<TranscribeOutput> {
    const command = process.env.TRANSCRIBER_CLI;
    if (!command) throw new Error("TRANSCRIBER_CLI is required for local transcriber provider");
    const args = command.split(/\s+/).filter(Boolean).concat(input.filePath);
    const bin = args.shift();
    if (!bin) throw new Error("invalid TRANSCRIBER_CLI");

    const text = await new Promise<string>((resolve, reject) => {
      const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk.toString("utf8")));
      child.stderr.on("data", (chunk) => (stderr += chunk.toString("utf8")));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(stdout.trim());
        else reject(new Error(stderr || `local transcriber exited with ${code}`));
      });
    });

    return { text, provider: this.name, model: command };
  }
}
