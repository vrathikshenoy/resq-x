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
  // Oldest-to-newest copy of the ring buffer.
  snapshot() {
    const out = new Float32Array(this.buffer.length);
    out.set(this.buffer.subarray(this.position));
    out.set(this.buffer.subarray(0, this.position), this.buffer.length - this.position);
    return out;
  }
}
// Fires only on a sustained scream: `needed` of the last `size` classifications at or above `threshold`.
// ponytail: thresholds are uncalibrated starting values; tune them with real recordings.
export class ScreamGate {
  constructor(threshold = 0.5, needed = 2, size = 3) {
    Object.assign(this, { threshold, needed, size, recent: [] });
  }
  push(score) {
    this.recent.push(score >= this.threshold);
    if (this.recent.length > this.size) this.recent.shift();
    return this.recent.filter(Boolean).length >= this.needed;
  }
}
// Recognizers transcribe the spoken brand name "ResQ" as the dictionary word "rescue".
export const normalizePhrase = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\bresq\b/g, "rescue")
    .replace(/\s+/g, " ")
    .trim();
export function matchesPhrase(transcript, phrase, confidence) {
  const p = normalizePhrase(phrase);
  return (
    p.length >= 5 &&
    confidence >= 0.75 &&
    (" " + normalizePhrase(transcript) + " ").includes(" " + p + " ")
  );
}
