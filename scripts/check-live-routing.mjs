import { routeRequest } from "../backend/routing.mjs";
const values = process.argv.slice(2).map(Number);
if (values.length !== 0 && values.length !== 4)
  throw new Error(
    "Usage: npm run test:live -- originLat originLon destinationLat destinationLon",
  );
const [a, b, c, d] = values.length ? values : [12.975, 77.59, 12.9705, 77.5948];
console.log(
  "Requesting live OSM street data. Public services may queue requests; allow up to 90 seconds for both providers.",
);
try {
  const r = await routeRequest({
    mode: "live",
    origin: [a, b],
    destination: [c, d],
  });
  if (r.mode !== "live" || !r.source?.fetchedAt)
    throw new Error("Expected live OSM data, not a sample result.");
  console.log(
    JSON.stringify(
      {
        source: r.source,
        attribution: r.attribution,
        nodes: Object.keys(r.network.nodes).length,
        segments: r.network.edges.length,
        shortestMetres: r.shortest.distance,
        weightedMetres: r.weighted.distance,
        weightedCost: r.weighted.cost,
        shortestRouteWeightedCost: r.shortest.cost,
        weightedLitPercent: r.weighted.lit_percent,
        lightingUnknownPercent: r.weighted.unknown_percent,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("Live OSM check failed: " + error.message);
  process.exitCode = 1;
}
