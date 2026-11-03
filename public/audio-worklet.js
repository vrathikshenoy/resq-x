import { AudioWindow } from "./audio-core.mjs";
class LocalMeter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.window = new AudioWindow(sampleRate);
    this.frames = 0;
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
    }
    return true;
  }
}
registerProcessor("resqx-local-meter", LocalMeter);
