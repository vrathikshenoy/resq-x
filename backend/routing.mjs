import { fail } from "./http.mjs";
import { fetchStreetElements } from "./overpass.mjs";
import { OVERPASS_QUERY_SECONDS } from "../shared/network.mjs";
import {
  distance,
  lighting,
  shortestPath,
  demoGraph,
  demoPlaces,
  demoRoute,
  ROUTE_EXPLANATION,
} from "../shared/routing.mjs";
export {
  distance,
  lighting,
  edgeCost,
  shortestPath,
  demoGraph,
  demoPlaces,
} from "../shared/routing.mjs";
const cache = new Map();
export function graphFromOSM(elements) {
  const nodes = {},
    edges = [];
  const points = elements.filter(
    (e) =>
      e.type === "node" &&
      e.tags &&
      (e.tags.shop ||
        [
          "cafe",
          "restaurant",
          "bus_station",
          "library",
          "hospital",
          "pharmacy",
        ].includes(e.tags.amenity) ||
        e.tags.public_transport === "platform"),
  );
  const allNodes = new Map(
    elements
      .filter((e) => e.type === "node")
      .map((n) => [n.id, [n.lat, n.lon]]),
  );
  for (const way of elements.filter(
    (e) => e.type === "way" && e.nodes && e.tags?.highway,
  )) {
    const t = way.tags;
    if (
      [
        "motorway",
        "motorway_link",
        "trunk",
        "trunk_link",
        "construction",
        "proposed",
      ].includes(t.highway) ||
      ["no", "private"].includes(t.foot) ||
      (["no", "private"].includes(t.access) &&
        !["yes", "designated", "permissive"].includes(t.foot))
    )
      continue;
    if (
      t.highway === "cycleway" &&
      !["yes", "designated", "permissive"].includes(t.foot)
    )
      continue;
    for (let i = 1; i < way.nodes.length; i++) {
      const a = allNodes.get(way.nodes[i - 1]),
        b = allNodes.get(way.nodes[i]);
      if (!a || !b) continue;
      const from = String(way.nodes[i - 1]),
        to = String(way.nodes[i]);
      nodes[from] = a;
      nodes[to] = b;
      const midpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
        activity = Math.min(
          1,
          points.filter((p) => distance(midpoint, [p.lat, p.lon]) <= 75)
            .length / 3,
        );
      const e = {
        from,
        to,
        length: distance(a, b),
        lit: lighting(t.lit),
        activity,
        name: t.name || t.highway,
      };
      if (t["oneway:foot"] !== "-1") edges.push(e);
      if (t["oneway:foot"] !== "yes") edges.push({ ...e, from: to, to: from });
      if (edges.length > 12000)
        fail(
          422,
          "This area is too dense for the prototype. Choose closer endpoints.",
        );
    }
  }
  return { nodes, edges };
}
async function liveGraph(origin, destination) {
  if (distance(origin, destination) > 3000)
    fail(422, "Live journeys are limited to endpoints within 3 km.");
  const south = Math.min(origin[0], destination[0]) - 0.003,
    north = Math.max(origin[0], destination[0]) + 0.003,
    west = Math.min(origin[1], destination[1]) - 0.003,
    east = Math.max(origin[1], destination[1]) + 0.003;
  const bounds = [south, west, north, east]
    .map((v) => Number(v.toFixed(4)))
    .join(",");
  const hit = cache.get(bounds);
  if (hit && Date.now() - hit.time < 3600000) return hit.graph;
  const q = `[out:json][timeout:${OVERPASS_QUERY_SECONDS}][maxsize:33554432];
way[highway][highway!~"^(motorway|motorway_link|trunk|trunk_link|construction|proposed)$"](${bounds})->.roads;
.roads out body;node(w.roads);out skel qt;
(node[shop](${bounds});node[amenity~"^(cafe|restaurant|bus_station|library|hospital|pharmacy)$"](${bounds});node[public_transport=platform](${bounds}););out body;`;

  const { elements, endpoint } = await fetchStreetElements(q);
  const graph = graphFromOSM(elements);
  graph.source = {
    provider: "OpenStreetMap / Overpass",
    endpoint,
    fetchedAt: new Date().toISOString(),
  };
  if (!Object.keys(graph.nodes).length)
    fail(422, "No walkable streets were found in this area.");
  if (cache.size >= 10) cache.delete(cache.keys().next().value);
  cache.set(bounds, { time: Date.now(), graph });
  return graph;
}
function coordinates(value) {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every(Number.isFinite) ||
    Math.abs(value[0]) > 85 ||
    Math.abs(value[1]) > 179.9
  )
    fail(422, "Enter valid latitude and longitude coordinates.");
  return value;
}
export async function routeRequest(data) {
  let graph,
    start,
    end,
    mode = data.mode;
  if (mode === "demo") return demoRoute(data.origin, data.destination);
  if (mode === "live") {
    const a = coordinates(data.origin),
      b = coordinates(data.destination);
    graph = await liveGraph(a, b);
    const nearest = (point) =>
      Object.keys(graph.nodes).reduce((best, id) =>
        distance(point, graph.nodes[id]) < distance(point, graph.nodes[best])
          ? id
          : best,
      );
    start = nearest(a);
    end = nearest(b);
    if (
      distance(a, graph.nodes[start]) > 250 ||
      distance(b, graph.nodes[end]) > 250
    )
      fail(
        422,
        "A selected location is more than 250 m from the available walking network.",
      );
  } else fail(422, "Choose live or demo routing.");
  if (start === end)
    fail(422, "Choose different start and destination points.");
  return {
    mode,
    source: graph.source,
    shortest: shortestPath(graph, start, end, false),
    weighted: shortestPath(graph, start, end, true),
    network: graph,
    attribution:
      mode === "demo"
        ? "Fictional sample network — not for navigation"
        : "© OpenStreetMap contributors",
    explanation: ROUTE_EXPLANATION,
  };
}
