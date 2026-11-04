// Downloads the free on-device audio models so the app serves them from its own origin:
// - Vosk small English (Apache-2.0, ~41 MB) for the wake phrase
// - YAMNet (Apache-2.0, ~4 MB) for scream detection
import { mkdir, rename, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
const models = {
  "vosk-model-small-en-us-0.15.tar.gz":
    "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz",
  "yamnet.tflite":
    "https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite",
};
await mkdir("public/models", { recursive: true });
for (const [name, url] of Object.entries(models)) {
  const out = "public/models/" + name;
  if (await stat(out).catch(() => null)) {
    console.log("Already present: " + out);
    continue;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name} download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(out + ".part"));
  await rename(out + ".part", out);
  console.log("Saved " + out);
}
console.log("Run npm run build to include the models.");
