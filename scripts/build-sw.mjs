import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
// Precache the app shell; large lazy-loaded files (voice/scream WASM, ~13 MB) are cached on first use instead.
const assets = [];
for (const f of await readdir("dist/assets"))
  if ((await stat("dist/assets/" + f)).size < 1000000) assets.push("/assets/" + f);
const shell = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  ...assets,
];
const version = createHash("sha256");
for (const file of shell.filter((f) => f !== "/"))
  version.update(await readFile("dist" + file));
const cache = "resqx-shell-" + version.digest("hex").slice(0, 12);
await writeFile(
  "dist/sw.js",
  `const CACHE=${JSON.stringify(cache)},SHELL=${JSON.stringify(shell)};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('resqx-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/')||u.pathname==='/health')return;
if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(c=>c.match('/index.html'))));return;}
if(SHELL.includes(u.pathname))e.respondWith(caches.open(CACHE).then(async c=>(await c.match(u.pathname))||fetch(e.request)));
else if(u.pathname.startsWith('/assets/')||u.pathname==='/models/yamnet.tflite')e.respondWith(caches.open(CACHE).then(async c=>(await c.match(u.pathname))||fetch(e.request).then(r=>{if(r.ok)c.put(u.pathname,r.clone());return r})));});
`,
);
console.log(
  "Offline shell generated: " +
    shell.length +
    " precached assets; larger assets are cached on first use. API responses are never cached.",
);
