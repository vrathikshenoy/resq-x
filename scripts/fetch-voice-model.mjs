// Downloads the free Vosk small English model (Apache-2.0, ~41 MB) so the app can serve it from its own origin.
import { mkdir, rename, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
const url =
  "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz";
const out = "public/models/vosk-model-small-en-us-0.15.tar.gz";
if (await stat(out).catch(() => null)) {
  console.log("Voice model already present: " + out);
  process.exit(0);
}
await mkdir("public/models", { recursive: true });
const res = await fetch(url);
if (!res.ok) throw new Error(`Model download failed: HTTP ${res.status}`);
await pipeline(Readable.fromWeb(res.body), createWriteStream(out + ".part"));
await rename(out + ".part", out);
console.log("Voice model saved to " + out + ". Run npm run build to include it.");
