export class AudioWindow {
  constructor(sampleRate, seconds = 1.5) {
    if (
      !Number.isFinite(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 192000
    )
      throw new Error("Unsupported sample rate.");
    this.buffer = new Float32Array(Math.ceil(sampleRate * seconds));
    this.position = 0;
  }
  push(samples) {
    let sum = 0;
    for (const value of samples) {
      this.buffer[this.position] = value;
      this.position = (this.position + 1) % this.buffer.length;
      sum += value * value;
    }
    return samples.length ? Math.sqrt(sum / samples.length) : 0;
  }
  clear() {
    this.buffer.fill(0);
    this.position = 0;
  }
}
export function matchesPhrase(transcript, phrase, confidence) {
  const normalize = (s) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const p = normalize(phrase);
  return (
    p.length >= 5 &&
    confidence >= 0.75 &&
    (" " + normalize(transcript) + " ").includes(" " + p + " ")
  );
}
