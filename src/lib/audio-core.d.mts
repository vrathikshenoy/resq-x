export class AudioWindow {
  constructor(sampleRate: number, seconds?: number);
  buffer: Float32Array;
  position: number;
  push(samples: Float32Array): number;
  clear(): void;
}
export function normalizePhrase(s: string): string;
export function matchesPhrase(
  transcript: string,
  phrase: string,
  confidence: number,
): boolean;
