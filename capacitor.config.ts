// shortcut: hosted PWA wrapper only; add native plugins and device tests for background sensors.
const url = process.env.RESQX_NATIVE_URL;
if (!url || !/^https:\/\//.test(url))
  throw new Error(
    "Set RESQX_NATIVE_URL to your deployed HTTPS app URL before running Capacitor.",
  );
export default {
  appId: "app.resqx.safety",
  appName: "RESQ-X",
  webDir: "dist",
  server: { url, cleartext: false },
  android: { allowMixedContent: false },
  ios: { contentInset: "automatic" },
};
