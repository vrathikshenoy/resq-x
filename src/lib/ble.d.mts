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
export function startRealScan(options: {
  capacitor?: CapacitorBLE;
  bluetooth?: BrowserBLE;
  secure?: boolean;
  signal: AbortSignal;
  onObservation: (id: string, name: string, rssi: number) => void;
}): Promise<{ stop: () => Promise<void> }>;
