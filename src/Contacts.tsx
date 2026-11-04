import { useState, useEffect } from "react";
import {
  Users,
  Plus,
  Check,
  Trash2,
  Pencil,
  Phone,
  History,
  X,
  LifeBuoy,
  Send,
  Copy,
} from "lucide-react";
import { api } from "./api";
export type Contact = {
  id: string;
  name: string;
  phone: string;
  relation: string;
  verified: number;
  telegram: number;
};
export type AlertRecord = {
  id: string;
  type: string;
  created: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  recipients: { name: string; status: string; channel?: string; error?: string }[];
  simulation?: boolean;
};
// One honest label per recipient: real Telegram delivery, failure, or demo simulation.
export const deliveryLabel = (r: AlertRecord["recipients"][number]) =>
  r.status === "sent"
    ? `${r.name}: sent on Telegram`
    : r.status === "failed"
      ? `${r.name}: Telegram failed${r.error ? " (" + r.error + ")" : ""}`
      : `${r.name}: simulated, nothing sent`;
export function Contacts({
  contacts,
  refresh,
  onSOS,
  historyVersion,
}: {
  contacts: Contact[];
  refresh: () => Promise<void>;
  onSOS: () => void;
  historyVersion: number;
}) {
  const [editing, setEditing] = useState<Contact | null>(null),
    [form, setForm] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [alerts, setAlerts] = useState<AlertRecord[]>([]),
    [removing, setRemoving] = useState<string | null>(null),
    [invite, setInvite] = useState<{ id: string; link: string } | null>(
      null,
    ),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    api<AlertRecord[]>("/alerts")
      .then(setAlerts)
      .catch((e) => setError(e.message));
  }, [historyVersion]);
  async function perform(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="feature-grid">
      <div className="stack">
        <section className="card">
          <div className="section-title">
            <h2>The people you can turn to</h2>
            <span className="pill">{contacts.length} of 10 contacts</span>
          </div>
          <p className="small-text" style={{ marginTop: 12 }}>
            Add someone who knows you. Ask for their consent before saving their
            number.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {contacts.length === 0 && !form && (
            <div className="empty">
              <Users size={40} />
              <h3>Build your trusted circle.</h3>
              <p>A friend, a family member, someone who picks up.</p>
            </div>
          )}
          <div className="contact-list">
            {contacts.map((c) => (
              <article className="contact-row" key={c.id}>
                <span className="avatar">{c.name[0].toUpperCase()}</span>
                <div className="grow">
                  <strong>{c.name}</strong>
                  <small>
                    {c.relation} · {c.phone}
                  </small>
                  <span
                    className={"verification " + (c.verified ? "verified" : "")}
                  >
                    {c.telegram ? (
                      <>
                        <Check size={12} />
                        Joined on Telegram · receives real alerts
                      </>
                    ) : c.verified ? (
                      <>
                        <Check size={12} />
                        Verified in simulation · no real alerts
                      </>
                    ) : (
                      "Not verified"
                    )}
                  </span>
                </div>
                <button
                  className="icon-button"
                  aria-label={"Edit " + c.name}
                  disabled={busy}
                  onClick={() => {
                    setEditing(c);
                    setForm(true);
                  }}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={"Remove " + c.name}
                  disabled={busy}
                  onClick={() => setRemoving(c.id)}
                >
                  <Trash2 size={15} />
                </button>
                {!c.telegram && (
                  <button
                    className="text-button verify-button"
                    disabled={busy}
                    onClick={() =>
                      perform(async () => {
                        const { link } = await api<{ link: string }>(
                          "/contacts/" + c.id + "/telegram",
                          {},
                        );
                        setCopied(false);
                        setInvite({ id: c.id, link });
                      })
                    }
                  >
                    Invite on Telegram <Send size={13} />
                  </button>
                )}
                {!c.verified && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      perform(() =>
                        api(
                          "/contacts/" + c.id,
                          { verify_simulation: true },
                          "PATCH",
                        ),
                      )
                    }
                  >
                    Simulate verification <Check size={13} />
                  </button>
                )}
                {invite?.id === c.id && (
                  <div className="invite-panel">
                    <span>
                      Send this link to {c.name}. When they open it and tap
                      <strong> Start</strong> in Telegram, they join your circle
                      and will get your real SOS alerts. It works once and
                      expires in 7 days.
                    </span>
                    <input
                      readOnly
                      value={invite.link}
                      aria-label={"Telegram invite link for " + c.name}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <button
                      className="button secondary"
                      onClick={async () => {
                        try {
                          if (navigator.share)
                            await navigator.share({
                              title: "Join my RESQ-X trusted circle",
                              url: invite.link,
                            });
                          else {
                            await navigator.clipboard.writeText(invite.link);
                            setCopied(true);
                          }
                        } catch {}
                      }}
                    >
                      <Copy size={14} />
                      {copied ? "Copied" : "Share link"}
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => perform(async () => setInvite(null))}
                    >
                      Done, check status
                    </button>
                  </div>
                )}
                {removing === c.id && (
                  <div className="remove-confirm">
                    <span>Remove {c.name} from your circle?</span>
                    <button
                      className="text-button"
                      onClick={() => setRemoving(null)}
                    >
                      Keep
                    </button>
                    <button
                      className="button danger"
                      disabled={busy}
                      onClick={() =>
                        perform(async () => {
                          await api("/contacts/" + c.id, undefined, "DELETE");
                          setRemoving(null);
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
          {form ? (
            <form
              className="contact-form"
              key={editing?.id || "new"}
              onSubmit={(e) => {
                e.preventDefault();
                const data = Object.fromEntries(new FormData(e.currentTarget));
                perform(async () => {
                  await api(
                    "/contacts" + (editing ? "/" + editing.id : ""),
                    data,
                    editing ? "PUT" : "POST",
                  );
                  setForm(false);
                  setEditing(null);
                });
              }}
            >
              <div className="section-title">
                <h3>{editing ? "Edit contact" : "Add someone you trust"}</h3>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close contact form"
                  onClick={() => {
                    setForm(false);
                    setEditing(null);
                  }}
                >
                  <X size={18} />
                </button>
              </div>
              <label>
                Name
                <input
                  name="name"
                  required
                  maxLength={60}
                  placeholder="e.g. Ananya"
                  defaultValue={editing?.name}
                />
              </label>
              <label>
                Phone number
                <input
                  name="phone"
                  type="tel"
                  required
                  pattern="\+[1-9][0-9]{7,14}"
                  placeholder="+919876543210"
                  defaultValue={editing?.phone}
                />
              </label>
              <label>
                Relationship
                <input
                  name="relation"
                  required
                  maxLength={30}
                  placeholder="e.g. Friend"
                  defaultValue={editing?.relation}
                />
              </label>
              <button className="button primary" disabled={busy}>
                {busy ? "Saving…" : "Save contact"}
                <Check size={15} />
              </button>
            </form>
          ) : (
            <button
              className="button secondary full"
              disabled={contacts.length >= 10}
              onClick={() => setForm(true)}
            >
              <Plus size={17} />
              Add trusted contact
            </button>
          )}
        </section>
        <section className="card">
          <div className="section-title">
            <h2>Alert history</h2>
            <History size={19} />
          </div>
          {alerts.length === 0 ? (
            <p className="small-text" style={{ margin: "20px 0 0" }}>
              No alerts yet. Practice once so the steps feel familiar.
            </p>
          ) : (
            alerts.map((a) => (
              <article className="alert-row" key={a.id}>
                <span className="alert-check">
                  <Check size={16} />
                </span>
                <div>
                  <strong>
                    {a.simulation ? "Simulated " : ""}
                    {a.type} alert
                  </strong>
                  <small>{new Date(a.created).toLocaleString()}</small>
                  <p>{a.recipients.map(deliveryLabel).join(" · ")}</p>
                  {a.latitude !== null ? (
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${a.latitude}&mlon=${a.longitude}#map=17/${a.latitude}/${a.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View included location
                    </a>
                  ) : (
                    <small>Location was not included.</small>
                  )}
                </div>
              </article>
            ))
          )}
        </section>
      </div>
      <aside className="stack">
        <section className="card">
          <span className="module-icon">
            <Phone size={24} />
          </span>
          <h2 style={{ marginTop: 20 }}>A quick rehearsal helps.</h2>
          <p className="small-text">
            An alert starts a 10-second countdown. You can cancel before it
            finishes. Contacts who joined on Telegram then get a real message;
            contacts verified only in simulation get nothing.
          </p>
          <button className="button danger full" onClick={onSOS}>
            <LifeBuoy size={17} />
            Start an SOS
          </button>
        </section>
        <div className="notice warning">
          <strong>Real alerts use Telegram (free).</strong>
          <br />
          Invite each contact on Telegram so they consent and can receive
          alerts. "Simulate verification" is for demos and sends nothing.
          After any SOS you can also text your contacts by SMS or call 112.
        </div>
        <section className="card">
          <h3>Keep your circle current</h3>
          <p className="small-text">
            Double-check phone numbers, keep contacts informed, and agree on
            what to do if you need help.
          </p>
        </section>
      </aside>
    </div>
  );
}
