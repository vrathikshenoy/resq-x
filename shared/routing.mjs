function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
export function distance(a, b) {
  const rad = Math.PI / 180,
    dlat = (b[0] - a[0]) * rad,
    dlon = (b[1] - a[1]) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function lighting(value) {
  return ["yes", "automatic", "24/7"].includes(value)
    ? "yes"
    : ["no"].includes(value)
      ? "no"
      : "unknown";
}
export function edgeCost(e, weighted) {
  const lit = e.lit === "yes" ? 1 : e.lit === "no" ? 0 : 0.5;
  return (
    e.length * (weighted ? 1 + 2.5 * (1 - lit) + 1.5 * (1 - e.activity) : 1)
  );
}
export function shortestPath(graph, start, end, weighted) {
  const adjacent = new Map();
  for (const e of graph.edges) {
    if (!adjacent.has(e.from)) adjacent.set(e.from, []);
    adjacent.get(e.from).push(e);
  }
  const costs = new Map([[start, 0]]),
    previous = new Map(),
    queue = [[0, start]];
  function push(item) {
    queue.push(item);
    let i = queue.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (queue[p][0] <= item[0]) break;
      queue[i] = queue[p];
      i = p;
    }
    queue[i] = item;
  }
  function pop() {
    const first = queue[0],
      last = queue.pop();
    if (queue.length) {
      let i = 0;
      while (2 * i + 1 < queue.length) {
        let j = 2 * i + 1;
        if (j + 1 < queue.length && queue[j + 1][0] < queue[j][0]) j++;
        if (queue[j][0] >= last[0]) break;
        queue[i] = queue[j];
        i = j;
      }
      queue[i] = last;
    }
    return first;
  }
  while (queue.length) {
    const [cost, node] = pop();
    if (cost !== costs.get(node)) continue;
    if (node === end) break;
    for (const e of adjacent.get(node) || []) {
      const next = cost + edgeCost(e, weighted);
      if (next < (costs.get(e.to) ?? Infinity)) {
        costs.set(e.to, next);
        previous.set(e.to, e);
        push([next, e.to]);
      }
    }
  }
  if (!costs.has(end))
    fail(
      422,
      "No connected walking route was found. Try closer endpoints or a different area.",
    );
  const segments = [];
  let node = end;
  while (node !== start) {
    const e = previous.get(node);
    if (!e) fail(422, "Unable to reconstruct this route.");
    segments.unshift(e);
    node = e.from;
  }
  const length = segments.reduce((s, e) => s + e.length, 0);
  return {
    coordinates: [
      graph.nodes[start],
      ...segments.map((e) => graph.nodes[e.to]),
    ],
    distance: Math.round(length),
    minutes: Math.max(1, Math.ceil(length / 75)),
    cost: Math.round(segments.reduce((s, e) => s + edgeCost(e, true), 0)),
    lit_percent: length
      ? Math.round(
          (segments
            .filter((e) => e.lit === "yes")
            .reduce((s, e) => s + e.length, 0) /
            length) *
            100,
        )
      : 0,
    unknown_percent: length
      ? Math.round(
          (segments
            .filter((e) => e.lit === "unknown")
            .reduce((s, e) => s + e.length, 0) /
            length) *
            100,
        )
      : 0,
    segments,
  };
}
export const demoPlaces = [
  { id: "0", name: "Cedar station" },
  { id: "15", name: "Library square" },
  { id: "3", name: "Market corner" },
  { id: "12", name: "Garden gate" },
];
export function demoGraph() {
  const nodes = {},
    edges = [];
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++)
      nodes[String(y * 4 + x)] = [12.975 - y * 0.0015, 77.59 + x * 0.0016];
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const from = String(y * 4 + x);
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        if (x + dx > 3 || y + dy > 3) continue;
        const to = String((y + dy) * 4 + x + dx),
          outer = (dy === 1 && x === 0) || (dx === 1 && y === 3),
          lit = outer ? "yes" : (x + y) % 3 === 0 ? "no" : "unknown",
          activity = outer ? 1 : 0.1;
        const length = distance(nodes[from], nodes[to]);
        const e = {
          from,
          to,
          length,
          lit,
          activity,
          name: outer
            ? "Market promenade"
            : y === 1
              ? "Garden lane"
              : "Cedar street",
        };
        edges.push(e, { ...e, from: to, to: from });
      }
    }
  return { nodes, edges };
}

export function demoRoute(origin, destination) {
  const graph = demoGraph(),
    start = String(origin),
    end = String(destination);
  if (
    !demoPlaces.some((p) => p.id === start) ||
    !demoPlaces.some((p) => p.id === end)
  )
    fail(422, "Select sample locations.");
  if (start === end)
    fail(422, "Choose different start and destination points.");
  return {
    mode: "demo",
    shortest: shortestPath(graph, start, end, false),
    weighted: shortestPath(graph, start, end, true),
    network: graph,
    attribution: "Fictional sample network — not for navigation",
    explanation: ROUTE_EXPLANATION,
  };
}
export const ROUTE_EXPLANATION =
  "Cost = metres × [1 + 2.5 × (1 − lighting) + 1.5 × (1 − activity)]. Unknown lighting = 0.5. Activity = selected amenities within 75 m, capped at 3. Tags are not live conditions.";
