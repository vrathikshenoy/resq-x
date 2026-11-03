import { test } from "node:test";
import assert from "node:assert/strict";

test("native BLE adapter handles plugin observations and stop (mock hardware)", async () => {
  const { startRealScan, trackingSupport } = await import("../src/lib/ble.mjs");
  let listener,
    options,
    removed = 0,
    stopped = 0,
    initialized;
  const plugin = {
    initialize: async (o) => {
      initialized = o;
    },
    isEnabled: async () => ({ value: true }),
    addListener: async (name, fn) => {
      assert.equal(name, "onScanResult");
      listener = fn;
      return {
        remove: async () => {
          removed++;
        },
      };
    },
    requestLEScan: async (o) => {
      options = o;
    },
    stopLEScan: async () => {
      stopped++;
    },
  };
  const cap = {
    isNativePlatform: () => true,
    isPluginAvailable: (name) => name === "BluetoothLe",
    registerPlugin: () => plugin,
  };
  const readings = [],
    controller = new AbortController();
  assert.equal(
    trackingSupport(
      { isNativePlatform: () => true, Plugins: { BluetoothLe: plugin } },
      undefined,
    ).kind,
    "native",
  );
  assert.equal(trackingSupport(cap, undefined).kind, "native");
  const scan = await startRealScan({
    capacitor: cap,
    signal: controller.signal,
    onObservation: (...args) => readings.push(args),
  });
  assert.equal(initialized.androidNeverForLocation, false);
  assert.equal(options.allowDuplicates, true);
  listener({
    device: { deviceId: "real-native-id", name: "Beacon" },
    rssi: -65,
  });
  listener({ device: { deviceId: "bad" }, rssi: NaN });
  assert.deepEqual(readings, [["real-native-id", "Beacon", -65]]);
  await scan.stop();
  listener({ device: { deviceId: "another" }, rssi: -50 });
  assert.equal(readings.length, 1);
  assert.equal(removed, 1);
  assert.ok(stopped >= 1);
  assert.equal(trackingSupport(undefined, undefined).kind, "unsupported");
  assert.equal(trackingSupport(cap, undefined, false).kind, "unsupported");
  await assert.rejects(
    () =>
      startRealScan({
        signal: new AbortController().signal,
        onObservation: () => {},
      }),
    /does not expose/,
  );
});

test("browser BLE uses advertisements and cancels a scan that resolves after stop", async () => {
  const { startRealScan } = await import("../src/lib/ble.mjs");
  const bt = new EventTarget();
  let grant,
    stopped = 0;
  bt.requestLEScan = () =>
    new Promise((resolve) => {
      grant = () =>
        resolve({
          stop() {
            stopped++;
          },
        });
    });
  const controller = new AbortController(),
    observed = [];
  const pending = startRealScan({
    bluetooth: bt,
    signal: controller.signal,
    onObservation: (...args) => observed.push(args),
  });
  controller.abort();
  grant();
  await assert.rejects(
    () => pending,
    (e) => e.name === "AbortError",
  );
  assert.equal(stopped, 1);
  assert.deepEqual(observed, []);
});
