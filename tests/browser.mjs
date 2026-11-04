import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = process.env.RESQX_BASE_URL || "http://127.0.0.1:3001";
try {
  const r = await fetch(base + "/health");
  assert.equal(r.status, 200);
} catch {
  throw new Error(
    "Start the app with npm run build && npm start, then run npm run test:e2e in another terminal.",
  );
}
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Never automate downloads from OSM's community tile server.
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.goto(base);
  await page.getByRole("button", { name: "Try the demo" }).click();
  await page.getByRole("heading", { name: /Your day/ }).waitFor();
  await page.screenshot({
    path: "test-results/desktop-home.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Set up my safety circle" }).click();
  await page
    .getByRole("button", { name: "Add trusted contact", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Demo Friend");
  await page.getByLabel("Phone number").fill("+15550102001");
  await page.getByLabel("Relationship").fill("Friend");
  await page.getByRole("button", { name: "Save contact" }).click();
  await page.getByText("Not verified", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Simulate verification", exact: true })
    .click();
  await page.getByText("Verified in simulation", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Start an SOS" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Cancel — I’m okay" }).click();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.getByText("No alerts yet.", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Start an SOS" }).click();
  await page
    .getByRole("heading", { name: "Your practice alert is recorded." })
    .waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByText("Simulated manual alert", { exact: true }).waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Trusted circle", exact: true })
    .click();
  await page.getByText("Demo Friend", { exact: true }).waitFor();
  await page.getByRole("button", { name: "RouteShield", exact: true }).click();
  await page.getByRole("button", { name: "Offline demo", exact: true }).click();
  await page.getByRole("button", { name: /Safety-weighted/ }).waitFor();
  assert.ok((await page.locator("table tbody tr").count()) > 0);
  await page.getByRole("button", { name: "DeepCloak", exact: true }).click();
  await page
    .getByRole("button", { name: "Or try a sample illustration" })
    .click();
  await page.getByAltText("Selected original photo").waitFor();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Run photo simulation" }).click();
  await page.getByRole("link", { name: "Save processed PNG" }).waitFor();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Save processed PNG" }).click();
  assert.equal(
    (await downloadEvent).suggestedFilename(),
    "resqx-simulated-photo.png",
  );
  await page.getByRole("button", { name: "TrackShield", exact: true }).click();
  await page
    .getByRole("button", { name: "Optional sample", exact: true })
    .click();
  for (let i = 0; i < 3; i++) {
    if (i === 1) await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Run sample scan" }).click();
    await page.getByRole("button", { name: "Run sample scan" }).waitFor();
  }
  await page
    .getByText("An unfamiliar device has repeatedly appeared nearby.", {
      exact: true,
    })
    .waitFor();
  await page.getByRole("button", { name: "Mark as trusted" }).first().click();
  await page
    .getByRole("button", { name: "Audio Trigger", exact: true })
    .click();
  await page.getByRole("button", { name: "Simulate wake phrase" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Cancel — I’m okay" }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "test-results/mobile-home.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page
    .getByRole("heading", { name: "Your tools & trusted circle" })
    .waitFor();
  await page.getByRole("button", { name: "DeepCloak", exact: true }).click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  // The service worker must control the document before an offline reload is meaningful.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await page.getByText("Offline", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Routes", exact: true }).click();
  await page.getByRole("button", { name: /Safety-weighted/ }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: contact persistence, SOS cancel/delivery, routing, photo export, tracking, audio rehearsal, mobile layout and offline routes.",
  );
  await context.close();
} finally {
  await browser.close();
}
