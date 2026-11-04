export type Observation = {
  rssi: number;
  time: number;
  session: string;
  moved: boolean;
};
import type { Tracker } from "./ble.mjs";
export type Device = {
  id: string;
  name: string;
  tracker: Tracker | null;
  observations: Observation[];
};
export function summarizeDevice(
  observations: Observation[],
  trusted?: boolean,
  tracker?: Tracker | null,
): {
  sessions: number;
  movedSessions: number;
  persistent: boolean;
  trend: string;
};
export function approximateDistance(
  rssi: number,
  reference?: number,
  pathLoss?: number,
): number;
export function appendObservation(
  devices: Device[],
  observation: Observation & {
    id: string;
    name: string;
    tracker?: Tracker | null;
  },
): Device[];
