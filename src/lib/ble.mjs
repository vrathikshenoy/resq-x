// Known tracker advertisements. Native (Capacitor) gives plain objects, browsers give Maps; both normalize here.
const entries = (data) =>
  data instanceof Map ? [...data] : Object.entries(data ?? {});
const fullUuid = (uuid) => {
  const u = String(uuid).toLowerCase();
  return /^[0-9a-f]{4}$/.test(u) ? `0000${u}-0000-1000-8000-00805f9b34fb` : u;
};
const sig = (short) => fullUuid(short);
const bytes = (view) =>
  view instanceof DataView
    ? new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
    : new Uint8Array(view ?? []);
export function identifyTracker({ manufacturerData, serviceData, uuids } = {}) {
  for (const [company, data] of entries(manufacturerData)) {
    const b = bytes(data);
    // Apple Find My "offline finding" frame: type 0x12; length 0x19 means separated from its owner.
    if (Number(company) === 0x004c && b[0] === 0x12)
      return {
        kind: "findmy",
        label: "Apple Find My tracker (AirTag or compatible)",
        separated: b[1] === 0x19,
      };
  }
  const service = new Map(
    entries(serviceData).map(([uuid, data]) => [fullUuid(uuid), bytes(data)]),
  );
  const advertised = new Set([...service.keys(), ...(uuids ?? []).map(fullUuid)]);
  // Cross-vendor "Detecting Unwanted Location Trackers" standard: only sent while separated.
  if (advertised.has(sig("fcb2")))
    return { kind: "dult", label: "Location tracker (unwanted-tracking standard)", separated: true };
  const fmdn = service.get(sig("feaa"));
  if (fmdn && (fmdn[0] === 0x40 || fmdn[0] === 0x41))
    return { kind: "fmdn", label: "Google Find Hub tracker", separated: fmdn[0] === 0x41 };
  if (advertised.has(sig("fd5a")))
    return { kind: "smarttag", label: "Samsung SmartTag", separated: null };
  if (advertised.has(sig("feed")) || advertised.has(sig("feec")))
    return { kind: "tile", label: "Tile tracker", separated: null };
  return null;
}
export function trackingSupport(capacitor, bluetooth, secure = true) {
  if (!secure)
    return {
      kind: "unsupported",
      message:
        "Bluetooth scanning needs HTTPS or localhost. A plain HTTP phone/LAN address cannot request Bluetooth permission.",
    };
  if (capacitor?.isNativePlatform?.())
    return capacitor.Plugins?.BluetoothLe ||
      (capacitor.isPluginAvailable?.("BluetoothLe") &&
        typeof capacitor.registerPlugin === "function")
      ? {
          kind: "native",
          message:
            "Native Bluetooth LE scanner available. Permission is requested only when you start.",
        }
      : {
          kind: "unsupported",
          message:
            "This native build does not include the BluetoothLe plugin. Install @capacitor-community/bluetooth-le and sync/rebuild the native app.",
        };
  if (bluetooth?.requestLEScan)
    return {
      kind: "web",
      message:
        "Browser BLE advertisement scanner available. Foreground operation only.",
    };
  return {
    kind: "unsupported",
    message:
      "This browser does not expose BLE advertisement scanning. Use an Android/iOS build with the BluetoothLe plugin for real scans. The sample is a separate, optional demonstration.",
  };
}
export async function startRealScan({
  capacitor,
  bluetooth,
  secure = true,
  signal,
  onObservation,
}) {
  const support = trackingSupport(capacitor, bluetooth, secure);
  if (support.kind === "unsupported") throw new Error(support.message);
  let closed = false,
    listener = null,
    scan = null,
    plugin = null;
  const lastSeen = new Map();
  function forward(id, name, rssi, advertisement) {
    if (
      closed ||
      signal.aborted ||
      typeof id !== "string" ||
      !id ||
      !Number.isFinite(rssi) ||
      rssi < -127 ||
      rssi > 20
    )
      return;
    const now = Date.now();
    if (now - (lastSeen.get(id) ?? -Infinity) < 3000) return;
    // Retain several separate scan sessions instead of filling history with one advertiser's rapid packets.
    if (lastSeen.size >= 100 && !lastSeen.has(id)) return;
    lastSeen.set(id, now);
    onObservation(
      id,
      typeof name === "string" ? name : "Unnamed BLE device",
      rssi,
      identifyTracker(advertisement),
    );
  }
  async function stop() {
    closed = true;
    signal.removeEventListener("abort", abort);
    const current = listener;
    listener = null;
    try {
      if (plugin) await plugin.stopLEScan();
      else scan?.stop();
    } finally {
      if (current) await current.remove();
      if (bluetooth && support.kind === "web")
        bluetooth.removeEventListener("advertisementreceived", webListener);
    }
  }
  const abort = () => {
    void stop().catch(() => {});
  };
  const webListener = (event) =>
    forward(event.device?.id, event.device?.name, event.rssi, event);
  function checkCancelled() {
    if (signal.aborted) throw new DOMException("Scan cancelled.", "AbortError");
  }
  try {
    checkCancelled();
    if (support.kind === "native") {
      plugin =
        capacitor.Plugins?.BluetoothLe ||
        capacitor.registerPlugin("BluetoothLe");
      await plugin.initialize({ androidNeverForLocation: false });
      checkCancelled();
      const enabled = await plugin.isEnabled();
      if (!enabled.value)
        throw new Error(
          "Bluetooth is switched off. Enable Bluetooth in your device settings, then try again.",
        );
      listener = await plugin.addListener("onScanResult", (event) =>
        forward(
          event.device?.deviceId,
          event.localName || event.device?.name,
          event.rssi,
          event,
        ),
      );
      checkCancelled();
      signal.addEventListener("abort", abort, { once: true });
      await plugin.requestLEScan({ allowDuplicates: true, scanMode: 1 });
    } else {
      bluetooth.addEventListener("advertisementreceived", webListener);
      signal.addEventListener("abort", abort, { once: true });
      scan = await bluetooth.requestLEScan({
        acceptAllAdvertisements: true,
        keepRepeatedDevices: true,
      });
    }
    checkCancelled();
    return { stop };
  } catch (error) {
    await stop().catch(() => {});
    throw error;
  }
}
