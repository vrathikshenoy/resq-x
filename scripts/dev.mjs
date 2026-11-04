import { spawn } from "node:child_process";
import { createApp } from "../backend/server.mjs";
import { features } from "../backend/features.mjs";
import { startTelegramPolling } from "../backend/telegram.mjs";

// Let the OS select a free API port, then give Vite that exact proxy target.
const api = createApp(features);
let web;
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  web?.kill();
  api.close(() => process.exit(code));
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop());
api.once("error", (error) => {
  console.error("RESQ-X API could not start: " + error.message);
  stop(1);
});
api.listen(0, "127.0.0.1", () => {
  const target = `http://127.0.0.1:${api.address().port}`;
  console.log("RESQ-X development API: " + target);
  startTelegramPolling();
  web = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0"],
    {
      stdio: "inherit",
      env: { ...process.env, RESQX_API_TARGET: target },
    },
  );
  web.once("error", (error) => {
    console.error("Vite could not start: " + error.message);
    stop(1);
  });
  web.once("exit", (code) => stop(code ?? 1));
});
