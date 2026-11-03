import { useEffect, useState, useRef } from "react";
import {
  MapPin,
  ArrowRight,
  Footprints,
  Sun,
  LocateFixed,
  ArrowUpDown,
  Info,
} from "lucide-react";
import { api } from "./api";
import { OSMMap } from "./OSMMap";
import { parseCoordinates } from "./lib/map.mjs";
import {
  demoRoute,
  demoPlaces as places,
  type RouteResult as Result,
  type Point,
} from "../shared/routing.mjs";
export function Routes() {
  const [mode, setMode] = useState(navigator.onLine ? "live" : "demo"),
    [origin, setOrigin] = useState("0"),
    [destination, setDestination] = useState("15"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<"weighted" | "shortest">("weighted");
  const [picking, setPicking] = useState<"origin" | "destination" | null>(null);
  const readPoint = (value: string) => {
    try {
      return parseCoordinates(value);
    } catch {
      return null;
    }
  };
  const currentJourney = useRef("");
  currentJourney.current = JSON.stringify([
    mode,
    from,
    to,
    origin,
    destination,
  ]);
  useEffect(() => {
    setResult(null);
  }, [from, to]);
  async function calculate() {
    const requestedJourney = currentJourney.current;
    setPicking(null);
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const coords = parseCoordinates;
      const response =
        mode === "demo"
          ? demoRoute(origin, destination)
          : await api<Result>("/navigation/route", {
              mode,
              origin: coords(from),
              destination: coords(to),
            });
      if (requestedJourney === currentJourney.current) setResult(response);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (mode === "demo") void calculate();
  }, []);
  function useLocation() {
    setError("");
    if (!navigator.geolocation) {
      setError("Location is unavailable in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        setFrom(
          `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`,
        ),
      () =>
        setError(
          "Location was denied or unavailable. Enter coordinates instead.",
        ),
      { timeout: 7000 },
    );
  }
  return (
    <div className="stack">
      <div className="feature-grid route-grid">
        <section className="card journey-form">
          <div className="section-title">
            <h2>Where are you heading?</h2>
            <Footprints size={20} />
          </div>
          <div className="segmented" aria-label="Route data source">
            <button
              disabled={busy}
              className={mode === "demo" ? "chosen" : ""}
              onClick={() => {
                setMode("demo");
                setPicking(null);
                setError("");
                setResult(demoRoute(origin, destination));
              }}
            >
              Offline demo
            </button>
            <button
              disabled={busy}
              className={mode === "live" ? "chosen" : ""}
              onClick={() => {
                setMode("live");
                setError("");
                setResult(null);
              }}
            >
              Live OSM data
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void calculate();
            }}
          >
            {mode === "demo" ? (
              <>
                <label>
                  Starting point
                  <select
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                  >
                    {places.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="journey-line">
                  <i />
                  <span>Walking · fictional sample network</span>
                  <button
                    type="button"
                    aria-label="Swap start and destination"
                    className="icon-button"
                    onClick={() => {
                      setOrigin(destination);
                      setDestination(origin);
                    }}
                  >
                    <ArrowUpDown size={15} />
                  </button>
                </div>
                <label>
                  Destination
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  >
                    {places.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <label>
                  Start: latitude, longitude
                  <input
                    required
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    placeholder="12.975, 77.590"
                  />
                </label>
                <button
                  className="text-button"
                  type="button"
                  style={{ marginBottom: 17 }}
                  onClick={useLocation}
                >
                  <LocateFixed size={14} />
                  Use my location
                </button>
                <button
                  className="text-button map-point-button"
                  type="button"
                  onClick={() => setPicking("origin")}
                >
                  Set start on map
                </button>
                <label>
                  Destination: latitude, longitude
                  <input
                    required
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="12.9705, 77.5948"
                  />
                </label>
                <button
                  className="text-button map-point-button"
                  type="button"
                  onClick={() => setPicking("destination")}
                >
                  Set destination on map
                </button>
                <p className="small-text">
                  Within 3 km. Coordinates are sent to this server; a bounding
                  area is sent to OpenStreetMap’s Overpass service. Map tiles
                  are loaded from OpenStreetMap. Routes snap to mapped
                  walking-network nodes within 250 m of your points.
                </p>
              </>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? "Comparing routes…" : "Compare walking routes"}
              <ArrowRight size={16} />
            </button>
          </form>
          {error && (
            <p className="error" role="alert" style={{ marginTop: 15 }}>
              {error}
            </p>
          )}
          <p className="fine-print">
            {mode === "demo"
              ? "Simulated streets and attributes. Not for real navigation."
              : "Map data can be incomplete. No street is guaranteed safe."}
          </p>
        </section>
        <section className="map-panel">
          {mode === "live" ? (
            <OSMMap
              origin={readPoint(from)}
              destination={readPoint(to)}
              result={result?.mode === "live" ? result : null}
              selected={selected}
              picking={picking}
              onPick={(point) => {
                const value = point.map((v) => v.toFixed(6)).join(", ");
                if (picking === "origin") setFrom(value);
                else setTo(value);
                setPicking(null);
                setResult(null);
              }}
            />
          ) : result ? (
            <RouteMap result={result} selected={selected} />
          ) : (
            <div className="map-loading">
              <MapPin size={36} />
              <p>Choose sample locations and compare routes.</p>
            </div>
          )}
        </section>
      </div>
      {result && (
        <>
          {result.source && (
            <div className="notice">
              <strong>Real OpenStreetMap street data</strong>
              <br />
              {Object.keys(result.network.nodes).length} mapped nodes ·{" "}
              {result.network.edges.length} directed segments. Retrieved{" "}
              {new Date(result.source.fetchedAt).toLocaleString()}. Unknown
              lighting remains unknown.
            </div>
          )}
          <div className="route-options">
            {(["weighted", "shortest"] as const).map((key) => {
              const r = result[key];
              return (
                <button
                  className={
                    "route-option " + (selected === key ? "selected" : "")
                  }
                  key={key}
                  onClick={() => setSelected(key)}
                >
                  <div className="row">
                    <span className={"route-radio " + key} />
                    <h3>
                      {key === "weighted" ? "Safety-weighted" : "Shortest path"}
                    </h3>
                    {key === "weighted" && (
                      <span className="pill">Map-based preference</span>
                    )}
                  </div>
                  <div className="route-stats">
                    <strong>
                      {r.minutes}
                      <small>min walk</small>
                    </strong>
                    <span>{(r.distance / 1000).toFixed(2)} km</span>
                    <span>
                      <Sun size={14} />
                      {r.lit_percent}% tagged lit
                    </span>
                    <span>
                      <Info size={14} />
                      {r.unknown_percent}% lighting unknown
                    </span>
                  </div>
                  <p>
                    {key === "weighted"
                      ? "Uses lighting and nearby amenities to weight street segments."
                      : "Minimizes walking distance on the available street network."}
                  </p>
                </button>
              );
            })}
          </div>
          <section className="card">
            <div className="section-title">
              <h2>Understand the choice</h2>
              <span className="pill">
                Weighted cost: {result[selected].cost}
              </span>
            </div>
            <p className="small-text" style={{ margin: "15px 0" }}>
              {result.explanation}
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Street segment</th>
                    <th>Distance</th>
                    <th>Lighting tag</th>
                    <th>Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {result[selected].segments.map((s, i) => (
                    <tr key={i}>
                      <td>{s.name}</td>
                      <td>{Math.round(s.length)} m</td>
                      <td>
                        <span className={"lit-tag " + s.lit}>{s.lit}</span>
                      </td>
                      <td>{Math.round(s.activity * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      <div className="notice warning">
        <strong>More information, not a safety guarantee.</strong> Lighting tags
        and amenities may be outdated. Nearby shops may be closed. The weights
        are experimental, and a longer route is not necessarily safer.
      </div>
    </div>
  );
}
function RouteMap({
  result,
  selected,
}: {
  result: Result;
  selected: "weighted" | "shortest";
}) {
  const values = Object.values(result.network.nodes),
    lat = values.map((p) => p[0]),
    lon = values.map((p) => p[1]);
  const minLat = Math.min(...lat),
    maxLat = Math.max(...lat),
    minLon = Math.min(...lon),
    maxLon = Math.max(...lon);
  const xy = (p: Point) => [
    55 + ((p[1] - minLon) / (maxLon - minLon || 0.001)) * 590,
    355 - ((p[0] - minLat) / (maxLat - minLat || 0.001)) * 300,
  ];
  const points = (list: Point[]) => list.map((p) => xy(p).join(",")).join(" ");
  const a = xy(result[selected].coordinates[0]),
    b = xy(result[selected].coordinates.at(-1)!);
  return (
    <svg
      className="route-map"
      viewBox="0 0 700 410"
      role="img"
      aria-label={`${result.mode === "demo" ? "Fictional sample" : "OpenStreetMap"} network, showing shortest and safety-weighted walking routes`}
    >
      <defs>
        <pattern
          id="map-grid"
          width="23"
          height="23"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 23 0 L 0 0 0 23"
            fill="none"
            stroke="#dfe8e1"
            strokeWidth=".5"
          />
        </pattern>
      </defs>
      <rect width="700" height="410" fill="#edf1e8" />
      <rect width="700" height="410" fill="url(#map-grid)" />
      {result.mode === "demo" && (
        <>
          <rect x="88" y="90" width="114" height="55" rx="20" fill="#d9e7d1" />
          <rect
            x="291"
            y="204"
            width="112"
            height="70"
            rx="17"
            fill="#d9e7d1"
          />
          <text x="314" y="243" fill="#8ba681" fontSize="11">
            Sample park
          </text>
          <text x="90" y="23" fill="#95a491" fontSize="10">
            FICTIONAL DEMO NETWORK
          </text>
          <text x="277" y="386" fill="#a3aca1" fontSize="11">
            Market promenade
          </text>
        </>
      )}
      {result.network.edges
        .filter((_, i) => i % 2 === 0 || result.mode === "live")
        .map((e, i) => (
          <polyline
            key={i}
            points={points([
              result.network.nodes[e.from],
              result.network.nodes[e.to],
            ])}
            fill="none"
            stroke="#fff"
            strokeWidth="11"
            strokeLinecap="round"
          />
        ))}
      {(
        [selected === "weighted" ? "shortest" : "weighted", selected] as const
      ).map((key) => (
        <polyline
          key={key}
          points={points(result[key].coordinates)}
          fill="none"
          stroke={key === "weighted" ? "#1c8b76" : "#8b9ca8"}
          strokeWidth={key === selected ? 7 : 4}
          strokeDasharray={key === "shortest" ? "7 6" : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={key === selected ? 1 : 0.65}
        />
      ))}
      <circle cx={a[0]} cy={a[1]} r="12" fill="white" />
      <circle cx={a[0]} cy={a[1]} r="7" fill="#177e72" />
      <circle
        cx={b[0]}
        cy={b[1]}
        r="12"
        fill="#dd775d"
        stroke="white"
        strokeWidth="4"
      />
      <text
        x={a[0] + 17}
        y={a[1] - 15}
        fill="#2b5346"
        fontSize="12"
        fontWeight="600"
      >
        Start
      </text>
      <text
        x={b[0] - 25}
        y={b[1] + 29}
        fill="#8c5e4d"
        fontSize="12"
        fontWeight="600"
      >
        Destination
      </text>
      <g transform="translate(20,382)">
        <rect width="12" height="4" y="-4" fill="#1c8b76" />
        <text x="18" fontSize="9" fill="#617a70">
          Weighted
        </text>
        <rect width="12" height="4" x="90" y="-4" fill="#8b9ca8" />
        <text x="108" fontSize="9" fill="#617a70">
          Shortest
        </text>
      </g>
    </svg>
  );
}
