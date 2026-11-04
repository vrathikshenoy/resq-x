export class AudioWindow {
  constructor(sampleRate: number, seconds?: number);
  buffer: Float32Array;
  position: number;
  push(samples: Float32Array): number;
  clear(): void;
  snapshot(): Float32Array;
}
export class ScreamGate {
  constructor(threshold?: number, needed?: number, size?: number);
  push(score: number): boolean;
}
export function normalizePhrase(s: string): string;
export function matchesPhrase(
  transcript: string,
  phrase: string,
  confidence: number,
): boolean;
