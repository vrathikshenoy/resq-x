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
  assert.deepEqual(readings, [["real-native-id", "Beacon", -65, null]]);
  // Native plugin: manufacturerData keyed by decimal company ID (76 = Apple).
  const separatedAirTag = new DataView(new Uint8Array([0x12, 0x19, 0x10, 1, 2]).buffer);
  listener({
    device: { deviceId: "airtag-id" },
    rssi: -70,
    manufacturerData: { 76: separatedAirTag },
  });
  assert.deepEqual(readings[1][3], {
    kind: "findmy",
    label: "Apple Find My tracker (AirTag or compatible)",
    separated: true,
  });
  await scan.stop();
  listener({ device: { deviceId: "another" }, rssi: -50 });
  assert.equal(readings.length, 2, "no readings after stop");
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

test("tracker identification from advertisement data", async () => {
  const { identifyTracker } = await import("../src/lib/ble.mjs");
  const { summarizeDevice, appendObservation } = await import("../src/lib/tracking.mjs");
  const view = (...b) => new DataView(new Uint8Array(b).buffer);
  // Browser events use Maps with numeric company IDs.
  assert.equal(identifyTracker({ manufacturerData: new Map([[0x004c, view(0x12, 0x02, 0x00)]]) }).separated, false, "near owner");
  assert.equal(identifyTracker({ manufacturerData: new Map([[0x004c, view(0x10, 0x05)]]) }), null, "other Apple frames are not trackers");
  assert.equal(identifyTracker({ uuids: ["0000fcb2-0000-1000-8000-00805f9b34fb"] }).kind, "dult");
  assert.equal(identifyTracker({ serviceData: { feaa: view(0x41, 1) } }).separated, true);
  assert.equal(identifyTracker({ serviceData: { feaa: view(0x10) } }), null, "plain Eddystone beacon");
  assert.equal(identifyTracker({ serviceData: new Map([["0000fd5a-0000-1000-8000-00805f9b34fb", view(1)]]) }).kind, "smarttag");
  assert.equal(identifyTracker({ uuids: ["FEED"] }).kind, "tile");
  assert.equal(identifyTracker({}), null);
  assert.equal(identifyTracker(), null);
  const obs = (session, moved) => ({ rssi: -60, time: 1, session, moved });
  const twoSessions = [obs("a", false), obs("b", true)];
  const separated = { kind: "findmy", label: "x", separated: true };
  assert.equal(summarizeDevice(twoSessions).persistent, false, "unknown device needs 3 sessions");
  assert.equal(summarizeDevice(twoSessions, false, separated).persistent, true, "separated tracker needs 2");
  assert.equal(summarizeDevice(twoSessions, true, separated).persistent, false, "trusted never warns");
  let devices = appendObservation([], { id: "t", name: "Tag", tracker: separated, ...obs("a", false) });
  devices = appendObservation(devices, { id: "t", name: "Tag", ...obs("b", true) });
  assert.equal(devices[0].tracker, separated, "identity survives later packets without it");
});
