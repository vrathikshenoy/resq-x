import { build } from "vite";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
await build({
  configFile: false,
  logLevel: "error",
  build: {
    ssr: "tests/ui.test.tsx",
    outDir: "test-results/ui",
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: "ui.test.mjs" } },
  },
});
process.env.NODE_ENV = "development";
await import(pathToFileURL(resolve("test-results/ui/ui.test.mjs")).href);
