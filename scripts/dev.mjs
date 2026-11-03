import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["--watch", "backend/server.mjs"], {
    stdio: "inherit",
  }),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0"],
    { stdio: "inherit" },
  ),
];
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    children.forEach((c) => c.kill(signal));
    process.exit(0);
  });
children.forEach((c) =>
  c.on("exit", (code) => {
    children.forEach((other) => {
      if (other !== c) other.kill();
    });
    process.exit(code || 0);
  }),
);
