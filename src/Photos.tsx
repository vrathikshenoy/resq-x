import { useEffect, useRef, useState } from "react";
import {
  ImagePlus,
  Upload,
  Download,
  LockKeyhole,
  Sparkles,
  Check,
  Trash2,
  Eye,
} from "lucide-react";
import { perturbPixels, validateImageHeader } from "./lib/photo.mjs";
type PhotoResult = {
  url: string;
  psnr: number | null;
  maxDelta: number;
  size: number;
  width: number;
  height: number;
};
function blobFrom(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(new Error("Your browser could not export this image.")),
      "image/png",
    ),
  );
}
function decode(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error(
          "This image could not be decoded. Try another JPEG, PNG or WebP.",
        ),
      );
    image.src = url;
  });
}
async function sample() {
  const c = document.createElement("canvas");
  c.width = 600;
  c.height = 700;
  const g = c.getContext("2d")!;
  g.fillStyle = "#e7ede6";
  g.fillRect(0, 0, 600, 700);
  g.fillStyle = "#c8dacd";
  g.beginPath();
  g.arc(480, 140, 160, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#245d55";
  g.beginPath();
  g.ellipse(300, 660, 220, 200, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#b77c5d";
  g.fillRect(259, 383, 82, 119);
  g.fillStyle = "#322b2d";
  g.beginPath();
  g.ellipse(300, 277, 130, 166, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#cd9a7b";
  g.beginPath();
  g.ellipse(300, 300, 100, 130, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#322b2d";
  g.beginPath();
  g.ellipse(268, 201, 99, 55, -0.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#3b3332";
  for (const x of [263, 338]) {
    g.beginPath();
    g.ellipse(x, 300, 6, 8, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = "#9a5e4b";
  g.lineWidth = 4;
  g.beginPath();
  g.arc(300, 346, 28, 0.2, Math.PI - 0.2);
  g.stroke();
  g.fillStyle = "#f5f7f2";
  g.font = "16px sans-serif";
  g.fillText("Sample illustration · no real person", 160, 662);
  return new File([await blobFrom(c)], "sample-illustration.png", {
    type: "image/png",
  });
}
export function Photos() {
  const [file, setFile] = useState<File | null>(null),
    [source, setSource] = useState(""),
    [result, setResult] = useState<PhotoResult | null>(null),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [view, setView] = useState("original");
  const input = useRef<HTMLInputElement>(null),
    active = useRef(true),
    job = useRef(0);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      job.current++;
    };
  }, []);
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source);
    },
    [source],
  );
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );
  async function choose(f: File) {
    setError("");
    setResult(null);
    setFile(null);
    setConsent(false);
    setSource("");
    setView("original");
    const task = ++job.current;
    try {
      validateImageHeader(
        new Uint8Array(await f.slice(0, 12).arrayBuffer()),
        f.type,
        f.size,
      );
      const url = URL.createObjectURL(f);
      try {
        const img = await decode(url);
        if (img.naturalWidth * img.naturalHeight > 24000000)
          throw new Error("Choose an image with fewer than 24 megapixels.");
        if (task !== job.current || !active.current) {
          URL.revokeObjectURL(url);
          return;
        }
        setFile(f);
        setSource(url);
      } catch (e) {
        URL.revokeObjectURL(url);
        throw e;
      }
    } catch (e) {
      if (active.current && task === job.current)
        setError((e as Error).message);
    }
  }
  async function process() {
    if (!file || !consent) return;
    setBusy(true);
    setError("");
    const task = ++job.current;
    try {
      const image = await decode(source),
        ratio = Math.min(
          1,
          1600 / Math.max(image.naturalWidth, image.naturalHeight),
        );
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * ratio);
      canvas.height = Math.round(image.naturalHeight * ratio);
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      await new Promise((r) => setTimeout(r, 40));
      const data = context.getImageData(0, 0, canvas.width, canvas.height),
        output = perturbPixels(data.data);
      data.data.set(output.pixels);
      context.putImageData(data, 0, 0);
      const blob = await blobFrom(canvas);
      if (task === job.current && active.current) {
        setResult({
          url: URL.createObjectURL(blob),
          psnr: output.psnr,
          maxDelta: output.maxDelta,
          size: blob.size,
          width: canvas.width,
          height: canvas.height,
        });
        setView("result");
      }
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <div className="stack">
      <div className="notice warning">
        <strong>Photo pipeline simulation.</strong> This applies random pixel
        changes and removes metadata. It is not model-based adversarial
        protection. No face-recognition or deepfake protection has been
        evaluated.
      </div>
      <div className="feature-grid">
        <section className="card photo-workspace">
          <div className="section-title">
            <h2>Your photo, on your device</h2>
            <span className="pill">
              <LockKeyhole size={12} />
              No upload
            </span>
          </div>
          {source ? (
            <>
              <div className="segmented photo-tabs">
                <button
                  className={view === "original" ? "chosen" : ""}
                  onClick={() => setView("original")}
                >
                  Original
                </button>
                <button
                  disabled={!result}
                  className={view === "result" ? "chosen" : ""}
                  onClick={() => setView("result")}
                >
                  Processed simulation
                </button>
              </div>
              <div className="photo-preview">
                <img
                  src={view === "result" && result ? result.url : source}
                  alt={
                    view === "result"
                      ? "Photo with simulated pixel changes"
                      : "Selected original photo"
                  }
                />
                <span>
                  {view === "result" ? "Simulated output" : "Original"}
                </span>
              </div>
              <div className="row photo-file">
                <ImagePlus size={17} />
                <span className="grow">{file?.name}</span>
                <button
                  className="icon-button"
                  disabled={busy}
                  aria-label="Remove selected photo"
                  onClick={() => {
                    job.current++;
                    setFile(null);
                    setSource("");
                    setResult(null);
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </>
          ) : (
            <div className="photo-drop">
              <span className="upload-icon">
                <ImagePlus size={34} />
              </span>
              <h3>A little privacy, before you post.</h3>
              <p>
                Select a photo to try the processing flow.
                <br />
                It stays in this browser, the whole time.
              </p>
              <button
                className="button primary"
                onClick={() => input.current?.click()}
              >
                <Upload size={16} />
                Choose a photo
              </button>
              <small>JPEG, PNG or WebP · up to 10 MB</small>
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await choose(await sample());
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Or try a sample illustration <Sparkles size={14} />
              </button>
            </div>
          )}
          <input
            ref={input}
            type="file"
            className="sr-only"
            aria-label="Choose photo file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void choose(f);
              e.currentTarget.value = "";
            }}
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
        <aside className="stack">
          <section className="card">
            <span
              className="module-icon"
              style={{ background: "#efedf9", color: "#8b72bd" }}
            >
              <Sparkles size={24} />
            </span>
            <h2 style={{ marginTop: 18 }}>Try the privacy workflow</h2>
            <p className="small-text">
              A subtle random perturbation uses a maximum change of 8/255 per
              color channel. The exported PNG strips original metadata and
              preserves those pixel values.
            </p>
            <label className="check-label">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>I own this photo or have permission to process it.</span>
            </label>
            <button
              className="button primary full"
              disabled={!file || !consent || busy}
              onClick={process}
            >
              {busy ? "Processing on your device…" : "Run photo simulation"}
              <Sparkles size={16} />
            </button>
            {result && (
              <a
                className="button secondary full"
                style={{ marginTop: 10 }}
                href={result.url}
                download="resqx-simulated-photo.png"
              >
                <Download size={16} />
                Save processed PNG
              </a>
            )}
          </section>
          {result ? (
            <section className="card">
              <div className="section-title">
                <h2>Measured image changes</h2>
                <Check size={18} />
              </div>
              <dl className="metrics">
                <div>
                  <dt>PSNR vs resized input</dt>
                  <dd>{result.psnr?.toFixed(2) || "∞"} dB</dd>
                </div>
                <div>
                  <dt>Maximum channel change</dt>
                  <dd>{result.maxDelta}/255</dd>
                </div>
                <div>
                  <dt>Output dimensions</dt>
                  <dd>
                    {result.width} × {result.height}
                  </dd>
                </div>
                <div>
                  <dt>Export size</dt>
                  <dd>{(result.size / 1024 / 1024).toFixed(2)} MB</dd>
                </div>
                <div>
                  <dt>Target face model</dt>
                  <dd>None — simulation</dd>
                </div>
              </dl>
              <p className="small-text">
                PSNR measures pixel similarity, not privacy effectiveness.
                Images are resized to at most 1600 px and transparency is
                rendered on white before processing.
              </p>
            </section>
          ) : (
            <section className="card">
              <h3>
                <Eye size={18} /> Review, then decide
              </h3>
              <p className="small-text">
                Compare both versions before saving. Nothing is uploaded, and
                your original file is never overwritten.
              </p>
              <p className="small-text">
                A real DeepCloak implementation needs a licensed face model,
                PGD/EOT optimization, and model-specific evaluation.
              </p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
