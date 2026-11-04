import { randomUUID } from "node:crypto";
import { db } from "./db.mjs";
import { fail, json, text } from "./http.mjs";
import {
  inviteLink,
  sendMessage,
  sosMessage,
  telegramEnabled,
} from "./telegram.mjs";
const publicAlert = ({ user_id, request_id, ...a }) => {
  const recipients = JSON.parse(a.recipients);
  return {
    ...a,
    recipients,
    simulation: recipients.every((r) => r.channel !== "telegram"),
  };
};
export async function contactFeatures({ path, method, data, user, res }) {
  if (path === "/api/v1/contacts" && method === "GET") {
    json(
      res,
      200,
      db
        .prepare(
          "SELECT id,name,phone,relation,verified,telegram_chat_id IS NOT NULL AS telegram FROM contacts WHERE user_id=? ORDER BY rowid",
        )
        .all(user.id),
    );
    return true;
  }
  const invite = path.match(/^\/api\/v1\/contacts\/([a-f0-9-]+)\/telegram$/);
  if (invite && method === "POST") {
    if (!telegramEnabled())
      fail(
        503,
        "Telegram alerts are not set up on this server. Set TELEGRAM_BOT_TOKEN and restart it.",
      );
    if (
      !db
        .prepare("SELECT id FROM contacts WHERE id=? AND user_id=?")
        .get(invite[1], user.id)
    )
      fail(404, "Contact not found.");
    let link;
    try {
      link = await inviteLink(invite[1], user.id);
    } catch (e) {
      fail(502, "Telegram could not be reached: " + e.message);
    }
    json(res, 200, { link });
    return true;
  }
  const match = path.match(/^\/api\/v1\/contacts\/([a-f0-9-]+)$/);
  if (
    (path === "/api/v1/contacts" && method === "POST") ||
    (match && method === "PUT")
  ) {
    const name = text(data.name, 1, 60),
      phone = text(data.phone, 8, 16),
      relation = text(data.relation, 1, 30);
    if (!/^\+[1-9]\d{7,14}$/.test(phone))
      fail(422, "Use international format, for example +919876543210.");
    if (
      match &&
      !db
        .prepare("SELECT id FROM contacts WHERE id=? AND user_id=?")
        .get(match[1], user.id)
    )
      fail(404, "Contact not found.");
    if (
      !match &&
      db
        .prepare("SELECT COUNT(*) AS n FROM contacts WHERE user_id=?")
        .get(user.id).n >= 10
    )
      fail(422, "You can add up to 10 trusted contacts.");
    const duplicate = db
      .prepare("SELECT id FROM contacts WHERE phone=? AND user_id=?")
      .get(phone, user.id);
    if (duplicate && duplicate.id !== match?.[1])
      fail(409, "This phone number is already in your circle.");
    const id = match?.[1] || randomUUID();
    if (match)
      db.prepare(
        "UPDATE contacts SET name=?,relation=?,verified=CASE WHEN phone=? THEN verified ELSE 0 END,telegram_chat_id=CASE WHEN phone=? THEN telegram_chat_id ELSE NULL END,phone=? WHERE id=? AND user_id=?",
      ).run(name, relation, phone, phone, phone, id, user.id);
    else
      db.prepare(
        "INSERT INTO contacts (id,user_id,name,phone,relation) VALUES (?,?,?,?,?)",
      ).run(id, user.id, name, phone, relation);
    json(res, match ? 200 : 201, {
      id,
      name,
      phone,
      relation,
      verified: db.prepare("SELECT verified FROM contacts WHERE id=?").get(id)
        .verified,
    });
    return true;
  }
  if (match && ["PATCH", "DELETE"].includes(method)) {
    if (
      !db
        .prepare("SELECT id FROM contacts WHERE id=? AND user_id=?")
        .get(match[1], user.id)
    )
      fail(404, "Contact not found.");
    if (method === "PATCH") {
      if (data.verify_simulation !== true)
        fail(422, "Explicitly confirm simulated verification.");
      db.prepare("UPDATE contacts SET verified=1 WHERE id=? AND user_id=?").run(
        match[1],
        user.id,
      );
      json(res, 200, { verified: true, simulation: true });
    } else {
      db.prepare("DELETE FROM contacts WHERE id=? AND user_id=?").run(
        match[1],
        user.id,
      );
      json(res, 200, { deleted: true });
    }
    return true;
  }
  if (path === "/api/v1/alerts" && method === "GET") {
    json(
      res,
      200,
      db
        .prepare(
          "SELECT * FROM alerts WHERE user_id=? ORDER BY created DESC LIMIT 50",
        )
        .all(user.id)
        .map(publicAlert),
    );
    return true;
  }
  if (path === "/api/v1/alerts/trigger" && method === "POST") {
    const requestId = text(data.request_id, 8, 80);
    if (!/^[a-zA-Z0-9-]+$/.test(requestId))
      fail(422, "Invalid request identifier.");
    if (!["manual", "phrase", "scream"].includes(data.type))
      fail(422, "Invalid alert type.");
    const old = db
      .prepare("SELECT * FROM alerts WHERE user_id=? AND request_id=?")
      .get(user.id, requestId);
    // A retry with the same request ID returns the first result and never re-sends.
    if (old) {
      json(res, 200, publicAlert(old));
      return true;
    }
    let latitude = null,
      longitude = null;
    if (data.location !== null && data.location !== undefined) {
      latitude = data.location.latitude;
      longitude = data.location.longitude;
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      )
        fail(422, "Invalid location coordinates.");
    }
    const contacts = db
      .prepare(
        "SELECT id,name,telegram_chat_id FROM contacts WHERE user_id=? AND verified=1",
      )
      .all(user.id);
    if (!contacts.length)
      fail(409, "Add a contact and verify them before sending an SOS.");
    const id = randomUUID(),
      created = new Date().toISOString();
    // Reserve the request ID first so a concurrent duplicate cannot send twice.
    db.prepare("INSERT INTO alerts VALUES (?,?,?,?,?,?,?,?,?)").run(
      id,
      user.id,
      requestId,
      data.type,
      created,
      latitude,
      longitude,
      "sending",
      "[]",
    );
    const message = sosMessage(user.name, data.type, latitude, longitude);
    const recipients = await Promise.all(
      contacts.map(async (c) => {
        const base = { contact_id: c.id, name: c.name };
        if (!c.telegram_chat_id)
          return {
            ...base,
            channel: "simulation",
            status: "simulated_delivered",
          };
        try {
          await sendMessage(c.telegram_chat_id, message);
          return { ...base, channel: "telegram", status: "sent" };
        } catch (e) {
          return {
            ...base,
            channel: "telegram",
            status: "failed",
            error: e.message.slice(0, 160),
          };
        }
      }),
    );
    const status = recipients.some((r) => r.status === "sent")
      ? "sent"
      : recipients.some((r) => r.status === "failed")
        ? "failed"
        : "simulated_delivered";
    db.prepare("UPDATE alerts SET status=?, recipients=? WHERE id=?").run(
      status,
      JSON.stringify(recipients),
      id,
    );
    json(
      res,
      201,
      publicAlert(db.prepare("SELECT * FROM alerts WHERE id=?").get(id)),
    );
    return true;
  }
  return false;
}
