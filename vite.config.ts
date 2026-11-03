import { defineConfig } from "vite";
const apiTarget = process.env.RESQX_API_TARGET || "http://127.0.0.1:3001";
export default defineConfig({
  server: {
    proxy: {
      "/api": apiTarget,
      "/health": apiTarget,
    },
  },
  build: { target: "es2022" },
});
