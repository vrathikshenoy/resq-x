import { useEffect, useRef, useState } from "react";
import {
  LifeBuoy,
  Check,
  X,
  TriangleAlert,
  Phone,
  MessageSquare,
} from "lucide-react";
import { api } from "./api";
import { deliveryLabel, type AlertRecord, type Contact } from "./Contacts";
type Location = { latitude: number; longitude: number } | null;
const mapLink = (l: NonNullable<Location>) =>
  `https://www.openstreetmap.org/?mlat=${l.latitude}&mlon=${l.longitude}#map=17/${l.latitude}/${l.longitude}`;
// Opens the phone's SMS app with every contact and the message filled in; the user taps Send. Free, no server.
// "?&body=" is the form both Android and iOS accept.
function smsHref(contacts: Contact[], location: Location) {
  const body = `SOS: I need help. ${location ? "My location: " + mapLink(location) + " " : ""}Please call me. (RESQ-X)`;
  return `sms:${contacts.map((c) => c.phone).join(",")}?&body=${encodeURIComponent(body)}`;
}
export type Trigger = "manual" | "phrase" | "scream";
export function SOS({
  type,
  contacts,
  onClose,
}: {
  type: Trigger;
  contacts: Contact[];
  onClose: () => void;
}) {
  const live = contacts.some((c) => c.verified && c.telegram);
  const [seconds, setSeconds] = useState(10),
    [stage, setStage] = useState<"countdown" | "sending" | "done" | "error">(
      "countdown",
    ),
    [result, setResult] = useState<AlertRecord | null>(null),
    [error, setError] = useState(""),
    [locationNote, setLocationNote] = useState("");
  const requestId = useRef(crypto.randomUUID()),
    deadline = useRef(Date.now() + 10000),
    dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null),
    locationRequest = useRef<Promise<Location> | null>(null),
    sent = useRef(false),
    alive = useRef(true),
    payload = useRef<{ location: Location } | null>(null),
    calling = useRef(false);
  // Every SOS includes location. Locating starts with the countdown, so those 10 s are used to get a fix
  // and any permission prompt appears while the user is looking at the screen.
  function requestLocation() {
    locationRequest.current ??= new Promise<Location>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) =>
          resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
        () => resolve(null),
        { timeout: 15000, maximumAge: 30000, enableHighAccuracy: true },
      );
    });
  }
  useEffect(() => {
    requestLocation();
  }, []);
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    cancel.current?.focus();
    return () => {
      alive.current = false;
      dialog.current?.close();
      previous?.focus();
    };
  }, []);
  async function send() {
    if (sent.current) return;
    sent.current = true;
    setStage("sending");
    try {
      if (!payload.current) {
        requestLocation();
        // An unanswered permission prompt never settles; send without location after 8 s.
        const location = await Promise.race([
          locationRequest.current!,
          new Promise<null>((r) => setTimeout(() => r(null), 8000)),
        ]);
        if (!location)
          setLocationNote(
            "Location unavailable or denied. Alert sent without coordinates.",
          );
        payload.current = {
          request_id: requestId.current,
          type,
          location,
        } as { location: Location };
      }
      const record = await api<AlertRecord>("/alerts/trigger", payload.current);
      if (alive.current) {
        setResult(record);
        setStage("done");
      }
    } catch (e) {
      if (alive.current) {
        setError((e as Error).message);
        setStage("error");
        sent.current = false;
      }
    }
  }
  useEffect(() => {
    if (stage !== "countdown") return;
    const update = () => {
      const remaining = Math.max(
        0,
        Math.ceil((deadline.current - Date.now()) / 1000),
      );
      setSeconds(remaining);
      if (!remaining) void send();
    };
    const id = setInterval(update, 150);
    const hidden = () => {
      // Opening the dialer for 112 hides the page; that must not cancel the alert.
      if (document.hidden && !calling.current) {
        onClose();
      }
    };
    document.addEventListener("visibilitychange", hidden);
    navigator.vibrate?.([100, 80, 100]);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [stage]);
  const fallbacks = (
    <div className="sos-fallbacks">
      <a
        className="button secondary full"
        href={smsHref(contacts, payload.current?.location ?? null)}
      >
        <MessageSquare size={17} />
        Also text them by SMS
      </a>
      <a className="button danger full" href="tel:112">
        <Phone size={17} />
        Call 112
      </a>
    </div>
  );
  return (
    <dialog
      ref={dialog}
      className="sos-dialog"
      aria-labelledby="sos-title"
      onCancel={(e) => {
        e.preventDefault();
        if (stage !== "sending") onClose();
      }}
    >
      <span className="pill coral">
        {live
          ? "Real alert · Telegram contacts"
          : "Practice · no message is sent"}
      </span>
      {stage === "countdown" ? (
        <>
          <div className="countdown-ring">
            <strong aria-live="off">{seconds}</strong>
            <small>seconds to cancel</small>
          </div>
          <h2 id="sos-title">
            {live
              ? "An SOS alert is about to be sent."
              : "A practice alert is about to start."}
          </h2>
          <p>
            {type === "manual"
              ? "You started an SOS."
              : `Your ${type === "phrase" ? "emergency phrase" : "scream detection"} started this countdown.`}{" "}
            {live
              ? "Contacts who joined on Telegram will get a real message."
              : "No contact has joined on Telegram, so nothing will be sent. You can text them by SMS afterwards."}
          </p>
          <p className="small-text">
            Your current location is included. If your browser asks, allow
            location access.
          </p>
          <button
            ref={cancel}
            className="button secondary full"
            onClick={onClose}
          >
            <X size={18} />
            Cancel — I’m okay
          </button>
          <a
            className="button danger full"
            href="tel:112"
            onClick={() => {
              calling.current = true;
              void send();
            }}
          >
            <Phone size={17} />
            Call 112 and send now
          </a>
          <p className="fine-print">
            Leaving the app during the countdown cancels this alert.
          </p>
        </>
      ) : stage === "sending" ? (
        <>
          <LifeBuoy size={48} className="dialog-icon" />
          <h2 id="sos-title">
            {live ? "Sending your alert…" : "Recording your practice alert…"}
          </h2>
          <p>Please keep the app open.</p>
        </>
      ) : stage === "done" ? (
        <>
          <span className="success-icon">
            <Check size={32} />
          </span>
          <h2 id="sos-title">
            {result?.status === "sent"
              ? "Your alert was sent."
              : result?.status === "failed"
                ? "Telegram couldn’t deliver your alert."
                : "Your practice alert is recorded."}
          </h2>
          <ul className="delivery-list">
            {result?.recipients.map((r) => (
              <li key={r.name + r.status}>{deliveryLabel(r)}</li>
            ))}
          </ul>
          {result?.status !== "sent" && (
            <div className="notice">
              No message reached anyone through the app. Text or call them
              yourself.
            </div>
          )}
          {locationNote && <p className="small-text">{locationNote}</p>}
          {fallbacks}
          <button className="button primary full" onClick={onClose}>
            Done <Check size={16} />
          </button>
        </>
      ) : (
        <>
          <TriangleAlert size={42} className="dialog-icon" />
          <h2 id="sos-title">The alert wasn’t confirmed.</h2>
          <p className="error" role="alert">
            {error}
          </p>
          <p className="small-text">
            Retrying uses the same alert ID, so nobody gets it twice.
          </p>
          {fallbacks}
          <div className="row">
            <button className="button secondary grow" onClick={onClose}>
              Close
            </button>
            <button className="button primary grow" onClick={() => send()}>
              Retry
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
