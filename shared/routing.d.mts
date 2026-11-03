export type Point = [number, number];
export type Segment = {
  from: string;
  to: string;
  length: number;
  lit: string;
  activity: number;
  name: string;
};
export type Path = {
  coordinates: Point[];
  distance: number;
  minutes: number;
  cost: number;
  lit_percent: number;
  unknown_percent: number;
  segments: Segment[];
};
export type Graph = { nodes: Record<string, Point>; edges: Segment[] };
export type RouteResult = {
  source?: { provider: string; fetchedAt: string };
  mode: string;
  shortest: Path;
  weighted: Path;
  network: Graph;
  attribution: string;
  explanation: string;
};
export function demoRoute(origin: string, destination: string): RouteResult;
export const demoPlaces: { id: string; name: string }[];
export function demoGraph(): Graph;
export function shortestPath(
  graph: Graph,
  start: string,
  end: string,
  weighted: boolean,
): Path;
export function edgeCost(edge: Segment, weighted: boolean): number;
export function distance(a: Point, b: Point): number;
export function lighting(value: unknown): string;
export const ROUTE_EXPLANATION: string;
