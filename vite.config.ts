import { defineConfig } from "vite";
const apiTarget = process.env.RESQX_API_TARGET || "http://127.0.0.1:3001";
export default defineConfig({
  server: {
    proxy: {
      "/api": { target: apiTarget, changeOrigin: false },
      "/health": { target: apiTarget, changeOrigin: false },
    },
  },
  build: { target: "es2022" },
});
