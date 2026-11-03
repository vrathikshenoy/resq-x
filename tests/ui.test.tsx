import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act } from "react";
import { App } from "../src/App";

test("section changes preserve work and drafts while stopping sensors; logout clears retained screens", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost:5173",
    pretendToBeVisual: true,
  });
  const saved = new Map();
  const globals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(globals)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  let stopped = 0,
    closed = 0;
  const revoked = [];
  const previousFetch = globalThis.fetch,
    previousRevoke = URL.revokeObjectURL;
  URL.revokeObjectURL = (url) => {
    revoked.push(url);
    previousRevoke(url);
  };
  globalThis.fetch = async (path) =>
    new Response(
      JSON.stringify(
        String(path).endsWith("/auth/me")
          ? { id: "test-user", name: "Tester", email: "tester@example.com" }
          : String(path).endsWith("/contacts") ||
              String(path).endsWith("/alerts")
            ? []
            : { ok: true },
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  window.scrollTo = () => {};
  window.matchMedia = () => ({ matches: false });
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: async () => ({
        getTracks: () => [{ stop: () => stopped++ }],
      }),
    },
    configurable: true,
  });
  const additional = {
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    Image: class {
      naturalWidth = 2;
      naturalHeight = 2;
      onload;
      set src(_) {
        queueMicrotask(() => this.onload?.());
      }
    },
    AudioContext: class {
      audioWorklet = { addModule: async () => {} };
      destination = {};
      createMediaStreamSource() {
        return { connect() {} };
      }
      createGain() {
        return { gain: { value: 0 }, connect() {} };
      }
      async resume() {}
      async close() {
        closed++;
      }
    },
    AudioWorkletNode: class {
      port = {};
      connect(gain) {
        return gain;
      }
    },
  };
  for (const [key, value] of Object.entries(additional)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({
    fillRect() {},
    drawImage() {},
    getImageData() {
      return { data: new Uint8ClampedArray(16).fill(255) };
    },
    putImageData() {},
  });
  dom.window.HTMLCanvasElement.prototype.toBlob = function (callback) {
    callback(
      new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
        type: "image/png",
      }),
    );
  };
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const visible = (selector) =>
    Array.from(document.querySelectorAll(selector)).filter(
      (e) => !e.closest("[hidden]"),
    );
  const button = (name) => {
    const found = visible("button").find((e) => e.textContent.trim() === name);
    assert.ok(found, `Missing visible button: ${name}`);
    return found;
  };
  const click = async (name) => {
    await act(async () => {
      button(name).click();
    });
  };
  const navigate = async (name) => {
    const found = Array.from(
      document.querySelectorAll(".sidebar nav button"),
    ).find((e) => e.textContent.trim() === name);
    assert.ok(found);
    await act(async () => found.click());
  };
  const fill = async (selector, value) => {
    const input = visible(selector)[0];
    assert.ok(input);
    const proto =
      input.tagName === "SELECT"
        ? dom.window.HTMLSelectElement.prototype
        : dom.window.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(proto, "value").set.call(input, value);
      input.dispatchEvent(
        new dom.window.Event(input.tagName === "SELECT" ? "change" : "input", {
          bubbles: true,
        }),
      );
    });
    return input;
  };
  try {
    await act(async () => root.render(<App />));
    await navigate("RouteShield");
    await act(async () => visible('button[aria-label="Zoom in"]')[0].click());
    const tileURL = visible(".osm-map > img")[0].src;
    await navigate("Trusted circle");
    assert.equal(
      document.querySelectorAll(".osm-map > img").length,
      0,
      "Hidden maps must not request tiles",
    );
    await navigate("RouteShield");
    assert.equal(
      visible(".osm-map > img")[0].src,
      tileURL,
      "Map zoom survives navigation",
    );
    await click("Offline demo");
    await fill("select", "3");
    await click("Compare walking routes");
    const route = document.querySelector(".route-options");
    assert.ok(route);
    await navigate("Trusted circle");
    await click("Add trusted contact");
    const draft = await fill('input[name="name"]', "Unsaved friend");
    await navigate("RouteShield");
    assert.equal(visible("select")[0].value, "3");
    assert.equal(document.querySelector(".route-options"), route);
    await navigate("Trusted circle");
    assert.equal(visible('input[name="name"]')[0], draft);
    assert.equal(draft.value, "Unsaved friend");
    await navigate("DeepCloak");
    const file = new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
      "portrait.png",
      { type: "image/png" },
    );
    const fileInput = visible("input[type=file]")[0];
    Object.defineProperty(fileInput, "files", { value: [file] });
    await act(async () => {
      fileInput.dispatchEvent(
        new dom.window.Event("change", { bubbles: true }),
      );
      await new Promise((r) => setTimeout(r, 5));
    });
    assert.ok(visible(".photo-preview img")[0]);
    await act(async () => visible("input[type=checkbox]")[0].click());
    await click("Run photo simulation");
    await act(async () => new Promise((r) => setTimeout(r, 60)));
    const output = visible("a[download]")[0];
    assert.ok(output);
    const outputUrl = output.href;
    await navigate("TrackShield");
    await click("Optional sample");
    await click("Run sample scan");
    await act(async () => new Promise((r) => setTimeout(r, 700)));
    assert.ok(document.querySelectorAll(".device-item").length > 0);
    const device = document.querySelector(".device-item");
    await navigate("Audio Trigger");
    await fill("input", "Please help me");
    await click("Enable foreground microphone");
    assert.ok(button("Stop listening"));
    await navigate("RouteShield");
    assert.ok(stopped > 0);
    assert.ok(closed > 0);
    await navigate("Audio Trigger");
    assert.equal(visible("input")[0].value, "Please help me");
    assert.ok(button("Enable foreground microphone"));
    await navigate("TrackShield");
    assert.equal(document.querySelector(".device-item"), device);
    assert.ok(button("Run sample scan"));
    await navigate("DeepCloak");
    assert.equal(visible("a[download]")[0].href, outputUrl);
    assert.equal(revoked.includes(outputUrl), false);
    const settings = Array.from(document.querySelectorAll("button")).find(
      (e) => e.textContent.trim() === "Settings & permissions",
    );
    await act(async () => settings.click());
    await click("Sign out");
    assert.equal(document.querySelector(".photo-preview"), null);
    assert.ok(revoked.includes(outputUrl));
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    URL.revokeObjectURL = previousRevoke;
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
