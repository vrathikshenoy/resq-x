export type CapacitorBLE = {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
  registerPlugin?: (name: string) => any;
  Plugins?: { BluetoothLe?: any };
};
export type BrowserBLE = EventTarget & {
  requestLEScan?: (options: {
    acceptAllAdvertisements: boolean;
    keepRepeatedDevices: boolean;
  }) => Promise<{ stop: () => void }>;
};
export function trackingSupport(
  capacitor: CapacitorBLE | undefined,
  bluetooth: BrowserBLE | undefined,
  secure?: boolean,
): { kind: string; message: string };
export type Tracker = {
  kind: "findmy" | "dult" | "fmdn" | "smarttag" | "tile";
  label: string;
  /** true: away from its owner; null: this tracker type does not say. */
  separated: boolean | null;
};
export function identifyTracker(advertisement?: {
  manufacturerData?: Map<number, DataView> | Record<string, DataView>;
  serviceData?: Map<string, DataView> | Record<string, DataView>;
  uuids?: string[];
}): Tracker | null;
export function startRealScan(options: {
  capacitor?: CapacitorBLE;
  bluetooth?: BrowserBLE;
  secure?: boolean;
  signal: AbortSignal;
  onObservation: (
    id: string,
    name: string,
    rssi: number,
    tracker: Tracker | null,
  ) => void;
}): Promise<{ stop: () => Promise<void> }>;
