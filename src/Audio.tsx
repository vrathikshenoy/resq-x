import { useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Play,
  Square,
  MessageCircle,
  Volume2,
  LockKeyhole,
} from "lucide-react";
import type { Trigger } from "./SOS";
type Recognition = EventTarget & {
  processLocally: boolean;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};
type RecognitionConstructor = {
  new (): Recognition;
  available?: (options: {
    langs: string[];
    processLocally: boolean;
  }) => Promise<string>;
  install?: (options: {
    langs: string[];
    processLocally: boolean;
  }) => Promise<boolean>;
};
import type { Model } from "vosk-browser";
import { matchesPhrase, normalizePhrase } from "./lib/audio-core.mjs";
// Vite bundles the worklet with its audio-core import and returns the hashed asset URL.
import workletUrl from "./lib/audio-worklet.js?worker&url";
// Free offline fallback model, served from this app's origin (npm run voice:model). Override to self-host elsewhere.
const VOSK_MODEL_URL =
  import.meta.env.VITE_VOSK_MODEL_URL ||
  "/models/vosk-model-small-en-us-0.15.tar.gz";
const VOICE_IDLE = ["Off", "Unavailable", "Stopped"];
export function Audio({
  onTrigger,
  ready,
  visible,
}: {
  onTrigger: (t: Trigger) => void;
  ready: boolean;
  visible: boolean;
}) {
  const [listening, setListening] = useState(false),
    [starting, setStarting] = useState(false),
    [level, setLevel] = useState(0),
    [error, setError] = useState(""),
    [phrase, setPhrase] = useState("Hey ResQ help"),
    [voiceStatus, setVoiceStatus] = useState("Off"),
    [lastEvent, setLastEvent] = useState("No triggers this visit."),
    [cooling, setCooling] = useState(false);
  const stream = useRef<MediaStream | null>(null),
    context = useRef<AudioContext | null>(null),
    recognition = useRef<Recognition | null>(null),
    meterNode = useRef<AudioWorkletNode | null>(null),
    vosk = useRef<Model | null>(null),
    onSamples = useRef<((samples: Float32Array) => void) | null>(null),
    running = useRef(false),
    active = useRef(true),
    run = useRef(0),
    cooldown = useRef(0),
    cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function stop() {
    run.current++;
    running.current = false;
    if (recognition.current) {
      recognition.current.onresult = null;
      recognition.current.onerror = null;
      recognition.current.onend = null;
      recognition.current.stop();
    }
    recognition.current = null;
    onSamples.current = null;
    vosk.current?.terminate();
    vosk.current = null;
    meterNode.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void context.current?.close().catch(() => {});
    context.current = null;
    if (active.current) {
      setListening(false);
      setStarting(false);
      setLevel(0);
      setVoiceStatus("Off");
    }
  }
  useEffect(() => {
    active.current = true;
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      active.current = false;
      stop();
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  useEffect(() => {
    if (!visible) stop();
  }, [visible]);
  function trigger(type: Trigger, source: string) {
    if (Date.now() < cooldown.current) return;
    if (!ready) {
      setError(
        "Add and simulate verification of a trusted contact before testing a trigger.",
      );
      return;
    }
    stop();
    cooldown.current = Date.now() + 30000;
    setCooling(true);
    cooldownTimer.current = setTimeout(() => {
      if (active.current) setCooling(false);
    }, 30000);
    setLastEvent(`${source} · ${new Date().toLocaleTimeString()}`);
    onTrigger(type);
  }
  async function start() {
    setError("");
    stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Microphone access needs HTTPS or localhost and a supported browser. Use a simulation below.",
      );
      return;
    }
    const current = run.current;
    setStarting(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (!active.current || run.current !== current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const audio = new AudioContext();
      context.current = audio;
      await audio.audioWorklet.addModule(workletUrl);
      if (!active.current || run.current !== current) {
        media.getTracks().forEach((t) => t.stop());
        void audio.close();
        return;
      }
      const meter = new AudioWorkletNode(audio, "resqx-local-meter"),
        gain = audio.createGain();
      gain.gain.value = 0;
      audio.createMediaStreamSource(media).connect(meter);
      meter.connect(gain).connect(audio.destination);
      meterNode.current = meter;
      meter.port.onmessage = (e) => {
        if (!active.current || !running.current) return;
        if (e.data.samples) onSamples.current?.(e.data.samples);
        else setLevel(Math.min(1, Math.sqrt(e.data.level) * 2));
      };
      await audio.resume();
      if (!active.current || run.current !== current) {
        media.getTracks().forEach((t) => t.stop());
        void audio.close().catch(() => {});
        return;
      }
      running.current = true;
      setListening(true);
      for (const track of media.getTracks())
        track.onended = () => {
          stop();
          if (active.current)
            setError(
              "Microphone access was interrupted. Start again when you’re ready.",
            );
        };
    } catch (e) {
      stop();
      if (active.current)
        setError(
          (e as Error).name === "NotAllowedError"
            ? "Microphone permission was denied. You can still rehearse a simulated trigger."
            : "The microphone could not start. Check permissions or try another browser.",
        );
    } finally {
      if (active.current) setStarting(false);
    }
  }
  async function enableVoice() {
    setError("");
    if (normalizePhrase(phrase).length < 5) {
      setError("Choose a phrase with at least 5 characters.");
      return;
    }
    const current = run.current;
    setVoiceStatus("Checking…");
    if (!(await startBrowserRecognizer(current)))
      if (running.current && run.current === current) await startVosk(current);
  }
  // Chrome's on-device recognizer. Returns false when unavailable so the offline Vosk model can take over.
  async function startBrowserRecognizer(current: number) {
    const Ctor =
      (
        window as Window & {
          SpeechRecognition?: RecognitionConstructor;
          webkitSpeechRecognition?: RecognitionConstructor;
        }
      ).SpeechRecognition ||
      (window as Window & { webkitSpeechRecognition?: RecognitionConstructor })
        .webkitSpeechRecognition;
    if (!Ctor?.available) return false;
    const options = { langs: ["en-US"], processLocally: true };
    try {
      const r = new Ctor();
      if (!("processLocally" in r)) return false;
      const status = await Ctor.available(options);
      if (status === "downloadable" || status === "downloading") {
        if (!Ctor.install || run.current !== current) return false;
        setVoiceStatus("Installing Chrome’s on-device speech pack…");
        if (!(await Ctor.install(options))) return false;
      } else if (status !== "available") return false;
      if (!running.current || run.current !== current) return true;
      r.processLocally = true;
      r.lang = "en-US";
      r.continuous = true;
      r.interimResults = false;
      recognition.current = r;
      r.onresult = (e: any) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const item = e.results[i];
          if (
            item.isFinal &&
            matchesPhrase(item[0].transcript, phrase, item[0].confidence)
          ) {
            trigger("phrase", "On-device phrase recognized");
            break;
          }
        }
      };
      r.onerror = (e: any) => {
        r.onend = null;
        setVoiceStatus("Stopped");
        setError(
          "On-device phrase recognition stopped (" +
            e.error +
            "). Microphone meter remains active; stop it below.",
        );
      };
      r.onend = () => {
        if (running.current && !document.hidden) {
          try {
            r.start();
          } catch {
            setVoiceStatus("Stopped");
          }
        }
      };
      r.start();
      setVoiceStatus("On-device (browser) · experimental");
      return true;
    } catch {
      recognition.current = null;
      return false;
    }
  }
  // Vosk: free, open-source (Apache-2.0) recognizer running in a Web Worker. Audio never leaves the page.
  async function startVosk(current: number) {
    const unavailable = (message: string) => {
      if (run.current !== current) return;
      vosk.current?.terminate();
      vosk.current = null;
      onSamples.current = null;
      setVoiceStatus("Unavailable");
      setError(message);
    };
    setVoiceStatus("Loading offline voice model…");
    // Missing files fall back to index.html; offline, rely on the copy Vosk keeps in IndexedDB.
    const head = await fetch(VOSK_MODEL_URL, { method: "HEAD" }).catch(
      () => null,
    );
    if (head && (!head.ok || head.headers.get("content-type")?.includes("html")))
      return unavailable(
        "The offline voice model is not installed on this server. Run npm run voice:model, then rebuild. Use the phrase simulation meanwhile.",
      );
    try {
      const { Model } = await import("vosk-browser");
      if (run.current !== current) return;
      const model = new Model(VOSK_MODEL_URL);
      vosk.current = model;
      await new Promise<void>((resolve, reject) => {
        model.on("load", (m) =>
          m.event === "load" && m.result ? resolve() : reject(),
        );
        model.on("error", reject);
      });
      const sampleRate = context.current?.sampleRate;
      if (!running.current || run.current !== current || !sampleRate) return;
      // A grammar limits output to the phrase or "[unk]", which suits a wake phrase.
      const recognizer = new model.KaldiRecognizer(
        sampleRate,
        JSON.stringify([normalizePhrase(phrase), "[unk]"]),
      );
      recognizer.setWords(true);
      recognizer.on("result", (m) => {
        if (m.event !== "result") return;
        const words = m.result.result ?? [];
        const confidence = words.length
          ? Math.min(...words.map((w) => w.conf))
          : 0;
        if (matchesPhrase(m.result.text, phrase, confidence))
          trigger("phrase", "Offline phrase recognized");
      });
      recognizer.on("error", () =>
        unavailable("Offline phrase recognition stopped unexpectedly."),
      );
      onSamples.current = (s) => recognizer.acceptWaveformFloat(s, sampleRate);
      meterNode.current?.port.postMessage({ forward: true });
      setVoiceStatus("Offline (Vosk) · experimental");
    } catch {
      unavailable(
        "The offline voice model could not load. Check the connection for the first download (about 41 MB), then try again.",
      );
    }
  }
  return (
    <div className="stack">
      <div className="notice warning">
        <strong>Foreground prototype.</strong> Listening stops when this app is
        hidden or this screen closes. Locked-screen or background operation is
        unavailable. Scream detection is simulated; microphone volume never
        triggers SOS.
      </div>
      <div className="feature-grid">
        <section className="card audio-workspace">
          <div className="section-title">
            <h2>A helping hand, hands-free</h2>
            <span className="pill">
              {listening ? "Microphone active" : "Microphone off"}
            </span>
          </div>
          <div className={"audio-stage " + (listening ? "listening" : "")}>
            <div className="mic-disc">
              {listening ? (
                <Mic size={39} strokeWidth={1.5} />
              ) : (
                <MicOff size={39} strokeWidth={1.5} />
              )}
            </div>
            <div
              className="audio-bars"
              role="img"
              aria-label={
                listening
                  ? "Live microphone volume, analyzed locally"
                  : "Microphone inactive"
              }
            >
              {Array.from({ length: 33 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    // Bars are a fixed 67px; clipping (paint only, no layout) shows the level with rounded ends.
                    clipPath: `inset(${
                      (67 -
                        (listening
                          ? 7 +
                            level *
                              60 *
                              (0.25 +
                                0.75 *
                                  Math.abs(Math.sin(i * 1.4 + level * 5)))
                          : 5 + Math.abs(Math.sin(i * 1.4)) * 6)) /
                      2
                    }px 0 round 2px)`,
                  }}
                />
              ))}
            </div>
            <h3>
              {listening
                ? "Listening, while you’re here."
                : "Your microphone is off."}
            </h3>
            <p>
              {listening
                ? "Audio is analyzed in memory. Nothing is recorded or uploaded."
                : "You decide when to enable microphone access."}
            </p>
          </div>
          <button
            className={"button full " + (listening ? "secondary" : "primary")}
            onClick={listening ? stop : start}
            disabled={starting}
          >
            {listening ? (
              <>
                <Square size={16} />
                Stop listening
              </>
            ) : (
              <>
                <Mic size={17} />
                {starting
                  ? "Requesting microphone…"
                  : "Enable foreground microphone"}
              </>
            )}
          </button>
          {error && (
            <p className="error" role="alert" style={{ marginTop: 15 }}>
              {error}
            </p>
          )}
          <div className="voice-controls">
            <h3>On-device wake phrase</h3>
            <label>
              Emergency phrase
              <input
                value={phrase}
                maxLength={60}
                minLength={5}
                disabled={!VOICE_IDLE.includes(voiceStatus)}
                onChange={(e) => setPhrase(e.target.value)}
              />
            </label>
            <div className="row wrap">
              <button
                className="button secondary"
                disabled={!listening || !VOICE_IDLE.includes(voiceStatus)}
                onClick={enableVoice}
              >
                <MessageCircle size={16} />
                Enable local phrase recognition
              </button>
              <span className="small-text muted" role="status">
                {voiceStatus}
              </span>
            </div>
            <p className="small-text">
              Uses Chrome’s on-device English recognizer when available,
              otherwise a free offline Vosk model (about 41 MB, downloaded
              once). Audio never leaves this device. Use everyday English
              words; “ResQ” is heard as “rescue”. The experimental confidence
              threshold is 0.75; it has not been calibrated across speakers.
            </p>
          </div>
        </section>
        <aside className="stack">
          <section className="card">
            <span
              className="module-icon"
              style={{ background: "#fcf0e4", color: "#cb965c" }}
            >
              <Play size={24} />
            </span>
            <h2 style={{ marginTop: 18 }}>Rehearse without a mic</h2>
            <p className="small-text">
              Try the trigger-to-countdown flow without giving microphone
              permission. All messages remain simulated.
            </p>
            <button
              className="button secondary full"
              disabled={cooling}
              onClick={() => trigger("phrase", "Simulated wake phrase")}
            >
              <MessageCircle size={17} />
              Simulate wake phrase
            </button>
            <button
              className="button secondary full"
              style={{ marginTop: 10 }}
              disabled={cooling}
              onClick={() => trigger("scream", "Simulated scream detection")}
            >
              <Volume2 size={17} />
              Simulate scream detection
            </button>
            {cooling && (
              <p className="small-text">
                30-second cooldown active to prevent repeated triggers.
              </p>
            )}
            {!ready && (
              <p className="small-text" style={{ color: "#a98b57" }}>
                First add and simulate verification of a trusted contact.
              </p>
            )}
            <p className="fine-print">{lastEvent}</p>
          </section>
          <section className="card">
            <h3>
              <LockKeyhole size={18} /> A short memory, by design
            </h3>
            <p className="small-text">
              A 1.5-second circular audio buffer stays in RAM. Older samples are
              overwritten. Only a volume value reaches the interface.
            </p>
            <p className="small-text">
              Raw audio is never written to storage or sent to the server. The
              buffer is discarded when you stop listening.
            </p>
          </section>
          <section className="card">
            <h3>After a trigger</h3>
            <p className="small-text">
              A visible 10-second countdown gives you time to cancel. Afterward,
              the server records a mock SOS for your demo contacts. Optional
              location is requested only then.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
