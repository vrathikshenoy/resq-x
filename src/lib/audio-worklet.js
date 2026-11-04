import { AudioWindow } from "./audio-core.mjs";
const CHUNK = 4096;
class LocalMeter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.window = new AudioWindow(sampleRate);
    this.frames = 0;
    // Samples leave the worklet only after the offline recognizer is enabled; they stay in this page's memory.
    this.chunk = null;
    this.port.onmessage = (e) => {
      this.chunk = e.data.forward ? new Float32Array(CHUNK) : null;
      this.filled = 0;
    };
  }
  process(inputs) {
    const samples = inputs[0]?.[0];
    if (samples) {
      const rms = this.window.push(samples);
      this.frames += samples.length;
      if (this.frames >= sampleRate / 10) {
        this.port.postMessage({ level: rms });
        this.frames = 0;
      }
      if (this.chunk) {
        if (this.filled + samples.length > CHUNK) this.flush();
        this.chunk.set(samples, this.filled);
        this.filled += samples.length;
        if (this.filled === CHUNK) this.flush();
      }
    }
    return true;
  }
  flush() {
    const data = this.chunk.subarray(0, this.filled);
    this.port.postMessage({ samples: data.slice() });
    this.filled = 0;
  }
}
registerProcessor("resqx-local-meter", LocalMeter);
