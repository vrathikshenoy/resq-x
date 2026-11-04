// Free alert delivery through a Telegram bot (create one with @BotFather, set TELEGRAM_BOT_TOKEN).
// Long polling needs no public URL or webhook, so it also works on localhost.
import { randomBytes } from "node:crypto";
import { db } from "./db.mjs";
export const telegramEnabled = () => !!process.env.TELEGRAM_BOT_TOKEN;
async function call(method, body, timeout = 10000) {
  const response = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!result.ok)
    throw new Error(result.description || `Telegram HTTP ${response.status}`);
  return result.result;
}
export const sendMessage = (chatId, text) =>
  call("sendMessage", {
    chat_id: chatId,
    text,
    link_preview_options: { is_disabled: true },
  });
let username;
export async function inviteLink(contactId, userId) {
  username ??= (await call("getMe", {})).username;
  const code = randomBytes(16).toString("hex");
  db.prepare(
    "UPDATE contacts SET telegram_code=?, telegram_code_expires=? WHERE id=? AND user_id=?",
  ).run(code, Date.now() + 7 * 86400000, contactId, userId);
  return `https://t.me/${username}?start=${code}`;
}
const TRIGGERS = {
  manual: "the SOS button",
  phrase: "their emergency phrase",
  scream: "scream detection",
};
export function sosMessage(name, type, latitude, longitude) {
  return [
    `🚨 SOS from ${name} (RESQ-X)`,
    `They triggered an alert using ${TRIGGERS[type]}.`,
    latitude === null
      ? "Location was not shared."
      : `Location: https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`,
    "Please try to reach them now. If you believe they are in danger, call 112.",
  ].join("\n");
}
// A contact joins by opening the invite link and tapping Start; that is their consent. /stop leaves every circle.
export async function handleUpdate(update) {
  const message = update.message;
  if (!message?.text || message.chat?.type !== "private") return;
  const chatId = String(message.chat.id),
    [command, code] = message.text.trim().split(/\s+/);
  if (command === "/start" && /^[a-f0-9]{32}$/.test(code || "")) {
    const row = db
      .prepare(
        "SELECT contacts.id, users.name FROM contacts JOIN users ON users.id=contacts.user_id WHERE telegram_code=? AND telegram_code_expires>?",
      )
      .get(code, Date.now());
    if (!row)
      return sendMessage(
        chatId,
        "This invite link has expired or was already used. Ask for a new one.",
      );
    db.prepare(
      "UPDATE contacts SET telegram_chat_id=?, verified=1, telegram_code=NULL, telegram_code_expires=NULL WHERE id=?",
    ).run(chatId, row.id);
    return sendMessage(
      chatId,
      `You're now in ${row.name}'s RESQ-X trusted circle. If they send an SOS, you'll get a message here. Send /stop at any time to leave.`,
    );
  }
  if (command === "/stop") {
    const left = db
      .prepare(
        "UPDATE contacts SET telegram_chat_id=NULL, verified=0 WHERE telegram_chat_id=?",
      )
      .run(chatId).changes;
    return sendMessage(
      chatId,
      left
        ? "You've left every RESQ-X circle. You won't receive alerts."
        : "You aren't in any RESQ-X circle.",
    );
  }
  return sendMessage(
    chatId,
    "To join someone's RESQ-X trusted circle, open the invite link they shared with you. Send /stop to leave.",
  );
}
// Called by both npm start and npm run dev. Only one process per bot token may poll.
export function startTelegramPolling() {
  if (!telegramEnabled()) return;
  void pollTelegram();
  console.log("Telegram alerts enabled: listening for contact invites.");
}
export async function pollTelegram(signal) {
  let offset = 0;
  while (!signal?.aborted) {
    try {
      const updates = await call(
        "getUpdates",
        { offset, timeout: 50, allowed_updates: ["message"] },
        60000,
      );
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleUpdate(update).catch((e) =>
          console.error("Telegram reply failed: " + e.message),
        );
      }
    } catch (e) {
      console.error("Telegram polling failed: " + e.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
