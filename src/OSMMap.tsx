import { useEffect, useRef, useState } from "react";
import type { Point, RouteResult } from "../shared/routing.mjs";
import { fitMap, project, unproject } from "./lib/map.mjs";
export function OSMMap({
  visible,
  origin,
  destination,
  result,
  selected,
  picking,
  onPick,
}: {
  visible: boolean;
  origin: Point | null;
  destination: Point | null;
  result: RouteResult | null;
  selected: "weighted" | "shortest";
  picking: "origin" | "destination" | null;
  onPick: (p: Point) => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    drag = useRef<{ x: number; y: number; pan: Point } | null>(null);
  const [size, setSize] = useState({ width: 700, height: 420 }),
    [zoomOffset, setZoomOffset] = useState(0),
    [pan, setPan] = useState<Point>([0, 0]),
    [tileError, setTileError] = useState(false);
  useEffect(() => {
    const observer = new ResizeObserver(([e]) => {
      if (e.contentRect.width > 0 && e.contentRect.height > 0)
        setSize({ width: e.contentRect.width, height: e.contentRect.height });
    });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const points = [
    ...(origin ? [origin] : []),
    ...(destination ? [destination] : []),
    ...(result?.weighted.coordinates || []),
    ...(result?.shortest.coordinates || []),
  ];
  const fit = fitMap(points, size.width, size.height),
    zoom = Math.max(2, Math.min(19, fit.zoom + zoomOffset)),
    center = project(fit.center, zoom);
  const boundsKey = JSON.stringify([
    origin,
    destination,
    result?.weighted.coordinates,
  ]);
  useEffect(() => {
    setPan([0, 0]);
    setZoomOffset(0);
    setTileError(false);
  }, [boundsKey]);
  const left = center[0] - size.width / 2 - pan[0],
    top = center[1] - size.height / 2 - pan[1],
    count = 2 ** zoom;
  const xy = (p: Point) => {
    const [x, y] = project(p, zoom);
    return [x - left, y - top];
  };
  const tiles = [];
  for (
    let x = Math.floor(left / 256);
    visible && x <= Math.floor((left + size.width) / 256);
    x++
  )
    for (
      let y = Math.floor(top / 256);
      y <= Math.floor((top + size.height) / 256);
      y++
    ) {
      if (y < 0 || y >= count) continue;
      const tileX = ((x % count) + count) % count;
      tiles.push(
        <img
          key={`${zoom}/${x}/${y}`}
          src={`https://tile.openstreetmap.org/${zoom}/${tileX}/${y}.png`}
          alt=""
          draggable={false}
          referrerPolicy="strict-origin-when-cross-origin"
          width={256}
          height={256}
          style={{ left: x * 256 - left, top: y * 256 - top }}
          onError={() => setTileError(true)}
        />,
      );
    }
  const marker = (p: Point | null, label: string, color: string) => {
    if (!p) return null;
    const [x, y] = xy(p);
    return (
      <g>
        <circle
          cx={x}
          cy={y}
          r="10"
          fill={color}
          stroke="white"
          strokeWidth="3"
        />
        <text
          x={x + 14}
          y={y - 10}
          stroke="white"
          strokeWidth="3"
          paintOrder="stroke"
          fill="#174b40"
          fontSize="12"
        >
          {label}
        </text>
      </g>
    );
  };
  function adjustZoom(amount: number) {
    setZoomOffset((v) =>
      Math.max(2 - fit.zoom, Math.min(19 - fit.zoom, v + amount)),
    );
    setPan([0, 0]);
    setTileError(false);
  }
  return (
    <div className="osm-map-shell">
      <div
        ref={root}
        className={"osm-map " + (picking ? "picking" : "")}
        tabIndex={0}
        role="region"
        aria-label="OpenStreetMap walking map. Arrow keys pan; plus and minus zoom. Choose Set start or Set destination, then click the map."
        onKeyDown={(e) => {
          if (
            ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
          ) {
            e.preventDefault();
            setPan((p) => [
              p[0] +
                (e.key === "ArrowLeft" ? 60 : e.key === "ArrowRight" ? -60 : 0),
              p[1] +
                (e.key === "ArrowUp" ? 60 : e.key === "ArrowDown" ? -60 : 0),
            ]);
          }
          if (e.key === "+" || e.key === "=") adjustZoom(1);
          if (e.key === "-") adjustZoom(-1);
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          drag.current = { x: e.clientX, y: e.clientY, pan };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d)
            setPan([d.pan[0] + e.clientX - d.x, d.pan[1] + e.clientY - d.y]);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (
            d &&
            Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 &&
            picking
          ) {
            const rect = e.currentTarget.getBoundingClientRect();
            onPick(
              unproject(
                [e.clientX - rect.left + left, e.clientY - rect.top + top],
                zoom,
              ),
            );
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        {tiles}
        <svg className="osm-overlay" width={size.width} height={size.height}>
          {result &&
            (
              [
                selected === "weighted" ? "shortest" : "weighted",
                selected,
              ] as const
            ).map((k) => (
              <polyline
                key={k}
                points={result[k].coordinates
                  .map((p) => xy(p).join(","))
                  .join(" ")}
                fill="none"
                stroke={k === "weighted" ? "#11796e" : "#687c98"}
                strokeWidth={k === selected ? 6 : 4}
                strokeDasharray={k === "shortest" ? "8 5" : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          {marker(origin, "Start", "#11796e")}
          {marker(destination, "Destination", "#dd775d")}
        </svg>
      </div>
      <div className="osm-controls">
        <button aria-label="Zoom in" onClick={() => adjustZoom(1)}>
          +
        </button>
        <button aria-label="Zoom out" onClick={() => adjustZoom(-1)}>
          −
        </button>
        <button
          aria-label="Fit journey"
          onClick={() => {
            setZoomOffset(0);
            setPan([0, 0]);
            setTileError(false);
          }}
        >
          ⌖
        </button>
      </div>
      <a
        className="osm-attribution"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
      >
        © OpenStreetMap contributors
      </a>
      {picking && (
        <div className="map-pick-hint" role="status">
          Tap the map to set{" "}
          {picking === "origin" ? "your starting point" : "your destination"}.
        </div>
      )}
      {tileError && (
        <div className="map-tile-error" role="status">
          Map tiles unavailable. Selected points and calculated route geometry
          remain visible.
        </div>
      )}
    </div>
  );
}
