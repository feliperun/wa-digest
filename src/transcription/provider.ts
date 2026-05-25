import type { TranscribeInput, TranscribeOutput } from "../types.js";

export interface TranscriberProvider {
  readonly name: string;
  transcribe(input: TranscribeInput): Promise<TranscribeOutput>;
}
