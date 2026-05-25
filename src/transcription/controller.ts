import type { AppConfig } from "../config.js";
import type { TranscribeInput, TranscribeOutput } from "../types.js";
import { LocalCliTranscriberProvider } from "./local-cli-provider.js";
import { NoopTranscriberProvider } from "./noop-provider.js";
import { OpenAiCompatibleTranscriberProvider } from "./openai-compatible-provider.js";
import type { TranscriberProvider } from "./provider.js";
import { SonioxTranscriberProvider } from "./soniox-provider.js";

export class TranscriberController {
  private readonly provider: TranscriberProvider;

  constructor(config: AppConfig, provider?: TranscriberProvider) {
    this.provider = provider || createTranscriberProvider(config);
  }

  async transcribe(input: TranscribeInput): Promise<TranscribeOutput> {
    return this.provider.transcribe(input);
  }
}

export function createTranscriberProvider(config: AppConfig): TranscriberProvider {
  switch (config.transcriberProvider.toLowerCase()) {
    case "soniox":
      return new SonioxTranscriberProvider(config);
    case "openai":
    case "openai-compatible":
    case "mistral":
    case "voxtral":
      return new OpenAiCompatibleTranscriberProvider(config);
    case "local":
    case "cli":
      return new LocalCliTranscriberProvider();
    case "noop":
    case "disabled":
      return new NoopTranscriberProvider();
    default:
      throw new Error(`unsupported transcriber provider: ${config.transcriberProvider}`);
  }
}
