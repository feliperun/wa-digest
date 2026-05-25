import type { TranscribeInput, TranscribeOutput } from "../types.js";
import type { TranscriberProvider } from "./controller.js";

export class NoopTranscriberProvider implements TranscriberProvider {
  readonly name = "noop";

  async transcribe(_input: TranscribeInput): Promise<TranscribeOutput> {
    return {
      text: "",
      provider: this.name,
      model: "none"
    };
  }
}
