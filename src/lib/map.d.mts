import type { Point } from "../../shared/routing.mjs";
export function parseCoordinates(value: string): Point;
export function project(point: Point, zoom: number): Point;
export function unproject(point: Point, zoom: number): Point;
export function fitMap(
  points: Point[],
  width: number,
  height: number,
): { zoom: number; center: Point };
