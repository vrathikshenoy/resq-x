import { createServer } from "node:http";
import { randomBytes, randomUUID, pbkdf2, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { db } from "./db.mjs";
const derive = promisify(pbkdf2);
const failures = new Map();
export function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
export function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
export function text(value, min = 1, max = 100) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    fail(422, `Enter text between ${min} and ${max} characters.`);
  return value.trim();
}
export function session(req) {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("resqx_session="))
    ?.slice(14);
  const row =
    token &&
    db
      .prepare(
        "SELECT users.id,users.name,users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?",
      )
      .get(token, Date.now());
  if (!row) fail(401, "Please sign in to continue.");
  return row;
}
function setSession(res, id) {
  const token = randomBytes(32).toString("hex");
  db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
  db.prepare("INSERT INTO sessions VALUES (?,?,?)").run(
    token,
    id,
    Date.now() + 7 * 86400000,
  );
  res.setHeader(
    "Set-Cookie",
    `resqx_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`,
  );
}
async function body(req) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    fail(415, "Send JSON data.");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1000000) fail(413, "Request is too large.");
    chunks.push(chunk);
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    fail(400, "Invalid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    fail(422, "Send a JSON object.");
  return parsed;
}
export async function handleFeature() {
  return false;
}
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};
export function createApp(featureHandler = handleFeature) {
  return createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(self), geolocation=(self), bluetooth=(self)",
    );
    try {
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname;
      const method = req.method;
      if (!["GET", "HEAD"].includes(method)) {
        const origin = req.headers.origin;
        const allowed = process.env.APP_ORIGIN || `http://${req.headers.host}`;
        if (origin && origin !== allowed)
          fail(403, "Request origin is not allowed.");
      }
      if (path === "/health" && method === "GET")
        return json(res, 200, {
          status: "ok",
          sms: "simulation",
          database: !!db.prepare("SELECT 1").get(),
        });
      const data = ["POST", "PUT", "PATCH"].includes(method)
        ? await body(req)
        : {};
      if (path === "/api/v1/auth/demo" && method === "POST") {
        const id = randomUUID();
        db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?)").run(
          id,
          "Explorer",
          null,
          null,
          null,
          new Date().toISOString(),
        );
        setSession(res, id);
        return json(res, 201, { id, name: "Explorer", email: null });
      }
      if (
        ["/api/v1/auth/register", "/api/v1/auth/login"].includes(path) &&
        method === "POST"
      ) {
        const email = text(data.email, 3, 254).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          fail(422, "Enter a valid email address.");
        if (
          typeof data.password !== "string" ||
          data.password.length < 10 ||
          data.password.length > 128
        )
          fail(422, "Use a password with 10–128 characters.");
        const key = req.socket.remoteAddress;
        const recent = failures.get(key);
        if (recent && recent.count >= 10 && Date.now() - recent.time < 900000)
          fail(429, "Too many attempts. Try again in 15 minutes.");
        let user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
        if (path.endsWith("register")) {
          if (user) fail(409, "An account with this email already exists.");
          const name = text(data.name, 1, 60),
            salt = randomBytes(16).toString("hex"),
            hash = (
              await derive(data.password, salt, 210000, 32, "sha256")
            ).toString("hex");
          const id = randomUUID();
          db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?)").run(
            id,
            name,
            email,
            hash,
            salt,
            new Date().toISOString(),
          );
          user = { id, name, email };
        } else {
          const candidate = await derive(
            data.password,
            user?.salt || "invalid-session-salt",
            210000,
            32,
            "sha256",
          );
          if (
            !user?.hash ||
            !timingSafeEqual(candidate, Buffer.from(user.hash, "hex"))
          ) {
            if (failures.size > 1000) failures.clear();
            failures.set(key, {
              count:
                (recent && Date.now() - recent.time < 900000
                  ? recent.count
                  : 0) + 1,
              time: Date.now(),
            });
            fail(401, "Email or password is incorrect.");
          }
          failures.delete(key);
        }
        setSession(res, user.id);
        return json(res, 200, {
          id: user.id,
          name: user.name,
          email: user.email,
        });
      }
      if (path === "/api/v1/auth/me" && method === "GET")
        return json(res, 200, session(req));
      if (path === "/api/v1/auth/logout" && method === "POST") {
        const token = (req.headers.cookie || "")
          .split(";")
          .map((s) => s.trim())
          .find((s) => s.startsWith("resqx_session="))
          ?.slice(14);
        if (token) db.prepare("DELETE FROM sessions WHERE token=?").run(token);
        res.setHeader(
          "Set-Cookie",
          "resqx_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        );
        return json(res, 200, { ok: true });
      }
      if (path.startsWith("/api/")) {
        const user = session(req);
        if (await featureHandler({ req, res, path, method, data, user }))
          return;
        fail(404, "Endpoint not found.");
      }
      if (!["GET", "HEAD"].includes(method)) fail(405, "Method not allowed.");
      const root = resolve("dist");
      let file = resolve(root, "." + decodeURIComponent(path));
      if (!file.startsWith(root + "/") && file !== root)
        fail(403, "Invalid path.");
      try {
        if (!(await stat(file)).isFile()) file = resolve(root, "index.html");
      } catch {
        file = resolve(root, "index.html");
      }
      const bytes = await readFile(file);
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      );
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "Cache-Control": file.endsWith("sw.js") ? "no-cache" : "no-cache",
      });
      res.end(method === "HEAD" ? undefined : bytes);
    } catch (error) {
      json(res, error.status || 500, {
        error: error.status
          ? error.message
          : "Something went wrong. Please try again.",
      });
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { features } = await import("./features.mjs");
  createApp(features).listen(
    Number(process.env.PORT || 3001),
    process.env.HOST || "127.0.0.1",
    () =>
      console.log(
        "RESQ-X running at http://127.0.0.1:" + (process.env.PORT || 3001),
      ),
  );
}
