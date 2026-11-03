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
  function forward(id, name, rssi) {
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
    forward(event.device?.id, event.device?.name, event.rssi);
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
