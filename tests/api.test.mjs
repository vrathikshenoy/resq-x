import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_PATH = ":memory:";
const { createApp } = await import("../backend/server.mjs");
const { features } = await import("../backend/features.mjs");
const app = createApp(features);
const { Readable } = await import("node:stream");
async function call(
  path,
  data,
  cookie,
  method = data ? "POST" : "GET",
  extra = {},
) {
  const headers = {
    host: "localhost",
    ...(data ? { "content-type": "application/json" } : {}),
    ...(cookie ? { cookie } : {}),
    ...extra,
  };
  const req = Readable.from(data ? [Buffer.from(JSON.stringify(data))] : []);
  Object.assign(req, {
    url: path,
    method,
    headers,
    socket: { remoteAddress: "127.0.0.1" },
  });
  return new Promise((resolve) => {
    const h = {};
    const res = {
      status: 200,
      setHeader(k, v) {
        h[k.toLowerCase()] = v;
      },
      writeHead(status, values) {
        this.status = status;
        Object.entries(values || {}).forEach(([k, v]) => this.setHeader(k, v));
      },
      end(bytes) {
        resolve({
          status: this.status,
          body: JSON.parse(bytes),
          cookie: h["set-cookie"]?.split(";")[0],
        });
      },
    };
    app.emit("request", req, res);
  });
}
test("health and authentication session lifecycle", async () => {
  assert.equal((await call("/health")).body.status, "ok");
  assert.equal((await call("/api/v1/auth/me")).status, 401);
  assert.equal(
    (await call("/api/v1/auth/register", { email: "bad", password: "short" }))
      .status,
    422,
  );
  const account = await call("/api/v1/auth/register", {
    name: "Test User",
    email: "test@example.com",
    password: "a-secure-test-password",
  });
  assert.equal(account.status, 200);
  assert.ok(account.cookie.includes("resqx_session="));
  assert.equal(
    (await call("/api/v1/auth/me", null, account.cookie)).body.name,
    "Test User",
  );
  assert.equal(
    (
      await call("/api/v1/auth/login", {
        email: "test@example.com",
        password: "wrong-password",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call("/api/v1/auth/login", {
        email: "test@example.com",
        password: "a-secure-test-password",
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/api/v1/auth/logout", {}, account.cookie)).status,
    200,
  );
  assert.equal(
    (await call("/api/v1/auth/me", null, account.cookie)).status,
    401,
  );
});
test("origin and content type validation", async () => {
  assert.equal(
    (
      await call("/api/v1/auth/demo", {}, null, "POST", {
        origin: "https://untrusted.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await call("/api/v1/auth/demo", null, null, "POST")).status,
    415,
  );
});
test("contact ownership, validation, verification and idempotent mock alerts", async () => {
  const a = await call("/api/v1/auth/demo", {}),
    b = await call("/api/v1/auth/demo", {});
  const path = "/api/v1/contacts";
  assert.equal(
    (
      await call(
        path,
        { name: "Friend", phone: "123", relation: "Friend" },
        a.cookie,
      )
    ).status,
    422,
  );
  const c = await call(
    path,
    { name: "Ananya", phone: "+919876543210", relation: "Friend" },
    a.cookie,
  );
  assert.equal(c.status, 201);
  assert.equal((await call(path, null, b.cookie)).body.length, 0);
  assert.equal(
    (await call(path + "/" + c.body.id, undefined, b.cookie, "DELETE")).status,
    404,
  );
  const alert = {
    request_id: "test-alert-request-001",
    type: "manual",
    location: null,
  };
  assert.equal(
    (await call("/api/v1/alerts/trigger", alert, a.cookie)).status,
    409,
  );
  await call(
    path + "/" + c.body.id,
    { verify_simulation: true },
    a.cookie,
    "PATCH",
  );
  const first = await call("/api/v1/alerts/trigger", alert, a.cookie),
    second = await call("/api/v1/alerts/trigger", alert, a.cookie);
  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(first.body.id, second.body.id);
  assert.equal(first.body.simulation, true);
  assert.equal(first.body.recipients[0].status, "simulated_delivered");
  assert.equal((await call("/api/v1/alerts", null, a.cookie)).body.length, 1);
  assert.equal((await call("/api/v1/alerts", null, b.cookie)).body.length, 0);
  assert.equal(
    (
      await call(
        "/api/v1/alerts/trigger",
        {
          ...alert,
          request_id: "invalid-location",
          location: { latitude: 95, longitude: 0 },
        },
        a.cookie,
      )
    ).status,
    422,
  );
  await call(
    path + "/" + c.body.id,
    { name: "Ananya", phone: "+919876543211", relation: "Friend" },
    a.cookie,
    "PUT",
  );
  assert.equal((await call(path, null, a.cookie)).body[0].verified, 0);
});
test("route scoring, shortest vs weighted paths and disconnected streets", async () => {
  const {
    demoGraph,
    shortestPath,
    edgeCost,
    lighting,
    routeRequest,
    graphFromOSM,
  } = await import("../backend/routing.mjs");
  const graph = demoGraph(),
    short = shortestPath(graph, "0", "15", false),
    weighted = shortestPath(graph, "0", "15", true);
  assert.ok(short.distance <= weighted.distance);
  assert.ok(weighted.cost <= short.cost);
  assert.equal(weighted.lit_percent, 100);
  assert.notDeepEqual(short.coordinates, weighted.coordinates);
  assert.equal(
    edgeCost({ length: 100, lit: "unknown", activity: 0 }, true),
    375,
  );
  assert.equal(lighting(undefined), "unknown");
  assert.equal(lighting("no"), "no");
  assert.throws(
    () => shortestPath({ nodes: graph.nodes, edges: [] }, "0", "15", true),
    /No connected/,
  );
  await assert.rejects(
    () => routeRequest({ mode: "live", origin: [91, 0], destination: [0, 0] }),
    /valid latitude/,
  );
  await assert.rejects(
    () => routeRequest({ mode: "demo", origin: "0", destination: "0" }),
    /different/,
  );
  const network = graphFromOSM([
    { type: "node", id: 1, lat: 0, lon: 0 },
    { type: "node", id: 2, lat: 0, lon: 0.001 },
    {
      type: "way",
      nodes: [1, 2],
      tags: { highway: "footway", "oneway:foot": "yes", lit: "yes" },
    },
    { type: "way", nodes: [1, 2], tags: { highway: "motorway" } },
  ]);
  assert.equal(network.edges.length, 1);
  assert.equal(network.edges[0].lit, "yes");
  const user = await call("/api/v1/auth/demo", {});
  const route = await call(
    "/api/v1/navigation/route",
    { mode: "demo", origin: "0", destination: "15" },
    user.cookie,
  );
  assert.equal(route.status, 200);
  assert.match(route.body.attribution, /Fictional/);
});
test("photo simulation enforces per-channel bounds, preserves alpha and validates formats", async () => {
  const { perturbPixels, validateImageHeader } =
    await import("../src/lib/photo.mjs");
  const original = new Uint8ClampedArray([0, 255, 128, 77, 250, 5, 100, 255]);
  const result = perturbPixels(original, 8, () => 0.99);
  assert.equal(original[2], 128);
  assert.equal(result.pixels[3], 77);
  assert.equal(result.pixels[7], 255);
  assert.ok(result.maxDelta <= 8);
  assert.ok(result.psnr > 20);
  assert.equal(result.pixels[1], 255);
  const low = perturbPixels(original, 8, () => 0);
  assert.equal(low.pixels[0], 0);
  assert.ok(low.maxDelta <= 8);
  assert.throws(() => perturbPixels(original, 9), /budget/);
  assert.throws(
    () => validateImageHeader(new Uint8Array([1, 2, 3]), "image/png", 3),
    /valid JPEG/,
  );
  assert.throws(
    () =>
      validateImageHeader(new Uint8Array(12), "image/png", 11 * 1024 * 1024),
    /10 MB/,
  );
  validateImageHeader(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    "image/png",
    100,
  );
});
test("tracking requires separate sessions and movement; trusted devices suppress warnings", async () => {
  const { appendObservation, summarizeDevice, approximateDistance } =
    await import("../src/lib/tracking.mjs");
  let devices = [];
  for (let i = 0; i < 3; i++)
    devices = appendObservation(devices, {
      id: "tag",
      name: "Sample tag",
      rssi: -60 + i,
      time: i,
      session: "session-" + i,
      moved: i > 0,
    });
  assert.equal(summarizeDevice(devices[0].observations).persistent, true);
  assert.equal(
    summarizeDevice(devices[0].observations, true).persistent,
    false,
  );
  assert.equal(
    summarizeDevice(
      devices[0].observations.map((o) => ({ ...o, session: "one" })),
    ).persistent,
    false,
  );
  assert.equal(
    summarizeDevice(
      devices[0].observations.map((o) => ({ ...o, moved: false })),
    ).persistent,
    false,
  );
  assert.equal(approximateDistance(-59, -59, 2), 1);
  assert.throws(() => approximateDistance(-59, -59, 0), /calibration/);
  for (let i = 0; i < 40; i++)
    devices = appendObservation(devices, {
      id: "tag",
      name: "Sample tag",
      rssi: -60,
      time: i,
      session: "extra",
      moved: false,
    });
  assert.equal(devices[0].observations.length, 30);
});
test("audio circular buffer is bounded and phrase matching uses confidence and whole words", async () => {
  const { AudioWindow, matchesPhrase } =
    await import("../public/audio-core.mjs");
  const audio = new AudioWindow(8000);
  assert.equal(audio.buffer.length, 12000);
  audio.push(new Float32Array(20000).fill(0.5));
  assert.equal(audio.buffer.length, 12000);
  assert.equal(audio.position, 8000);
  assert.equal(audio.push(new Float32Array([0.5, 0.5])), 0.5);
  audio.clear();
  assert.equal(audio.buffer.some(Boolean), false);
  assert.equal(matchesPhrase("Hey ResQ, help!", "Hey ResQ help", 0.9), true);
  assert.equal(matchesPhrase("Hey ResQ helpful", "Hey ResQ help", 0.9), false);
  assert.equal(matchesPhrase("Hey ResQ help", "Hey ResQ help", 0.3), false);
});
test("JSON object boundary, duplicate contacts and API methods", async () => {
  assert.equal((await call("/api/v1/auth/demo", [])).status, 422);
  const user = await call("/api/v1/auth/demo", {}),
    contact = { name: "Friend", phone: "+15550102002", relation: "Friend" };
  assert.equal(
    (await call("/api/v1/contacts", contact, user.cookie)).status,
    201,
  );
  assert.equal(
    (await call("/api/v1/contacts", contact, user.cookie)).status,
    409,
  );
  assert.equal(
    (
      await call(
        "/api/v1/navigation/route",
        { mode: "unsupported" },
        user.cookie,
      )
    ).status,
    422,
  );
  assert.equal((await call("/api/v1/missing", null, user.cookie)).status, 404);
});

test("Vite proxy preserves browser host for authenticated POST requests", async () => {
  const { loadConfigFromFile } = await import("vite");
  const loaded = await loadConfigFromFile({
    command: "serve",
    mode: "development",
  });
  for (const path of ["/api", "/health"])
    assert.equal(loaded.config.server.proxy[path].changeOrigin, false);
  for (const host of [
    "localhost:5173",
    "127.0.0.1:5173",
    "192.168.1.44:5173",
  ]) {
    const response = await call("/api/v1/auth/demo", {}, null, "POST", {
      host,
      origin: `http://${host}`,
    });
    assert.equal(response.status, 201);
    assert.ok(response.cookie);
  }
  assert.equal(
    (
      await call("/api/v1/auth/demo", {}, null, "POST", {
        host: "localhost:5173",
        origin: "https://untrusted.example",
      })
    ).status,
    403,
  );
});

test("live routing uses OSM street tags, caches requests and never substitutes a demo on failure", async () => {
  const { routeRequest } = await import("../backend/routing.mjs");
  const originalFetch = globalThis.fetch;
  let requests = 0;
  const elements = [
    { type: "node", id: 101, lat: 12.97, lon: 77.59 },
    { type: "node", id: 102, lat: 12.97, lon: 77.591 },
    { type: "node", id: 103, lat: 12.97, lon: 77.592 },
    { type: "node", id: 104, lat: 12.971, lon: 77.59 },
    { type: "node", id: 105, lat: 12.971, lon: 77.592 },
    {
      type: "node",
      id: 106,
      lat: 12.9705,
      lon: 77.59,
      tags: { amenity: "cafe" },
    },
    {
      type: "node",
      id: 107,
      lat: 12.971,
      lon: 77.591,
      tags: { shop: "convenience" },
    },
    {
      type: "way",
      nodes: [101, 102, 103],
      tags: { highway: "residential", name: "Direct street", lit: "no" },
    },
    {
      type: "way",
      nodes: [101, 104, 105, 103],
      tags: { highway: "footway", name: "Lit promenade", lit: "yes" },
    },
    {
      type: "way",
      nodes: [101, 103],
      tags: {
        highway: "service",
        access: "private",
        name: "Private shortcut",
        lit: "yes",
      },
    },
  ];
  try {
    globalThis.fetch = async (url, options) => {
      requests++;
      assert.equal(url, "https://overpass-api.de/api/interpreter");
      assert.match(options.body.get("data"), /way\[highway\]/);
      assert.match(options.body.get("data"), /node\(w\.roads\)/);
      assert.match(options.body.get("data"), /highway!~/);
      assert.ok(!options.body.get("data").includes(";>;"));
      return new Response(JSON.stringify({ elements }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const input = {
      mode: "live",
      origin: [12.97, 77.59],
      destination: [12.97, 77.592],
    };
    const result = await routeRequest(input);
    assert.equal(result.mode, "live");
    assert.match(result.attribution, /OpenStreetMap/);
    assert.ok(result.source.fetchedAt);
    assert.ok(result.weighted.cost <= result.shortest.cost);
    assert.notDeepEqual(
      result.weighted.coordinates,
      result.shortest.coordinates,
    );
    assert.equal(result.weighted.lit_percent, 100);
    assert.ok(result.weighted.segments.some((e) => e.activity > 0));
    assert.ok(!result.network.edges.some((e) => e.name === "Private shortcut"));
    await routeRequest(input);
    assert.equal(requests, 1);
    globalThis.fetch = async () => {
      throw new Error("Provider offline");
    };
    await assert.rejects(
      () => routeRequest({ ...input, origin: [12.9702, 77.59] }),
      (e) => e.status === 503 && /unavailable/.test(e.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("map coordinates and tile projection round trip without external tile downloads", async () => {
  const { parseCoordinates, project, unproject, fitMap } =
    await import("../src/lib/map.mjs");
  assert.deepEqual(parseCoordinates("12.97, 77.59"), [12.97, 77.59]);
  for (const value of ["", ",", "91,0", "12,77,9", "text,77"])
    assert.throws(() => parseCoordinates(value));
  for (const point of [
    [0, 0],
    [12.97, 77.59],
    [-40, 100],
  ]) {
    const restored = unproject(project(point, 15), 15);
    assert.ok(Math.abs(restored[0] - point[0]) < 1e-9);
    assert.ok(Math.abs(restored[1] - point[1]) < 1e-9);
  }
  const view = fitMap(
    [
      [12.97, 77.59],
      [12.98, 77.6],
    ],
    400,
    400,
  );
  assert.ok(view.zoom >= 2 && view.zoom <= 17);
});

test("Overpass retries server outages, identifies DNS failure and respects rate limits", async () => {
  const { fetchStreetElements } = await import("../backend/overpass.mjs");
  const previousFetch = globalThis.fetch,
    previousURL = process.env.OVERPASS_URL;
  delete process.env.OVERPASS_URL;
  try {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(url);
      return calls.length === 1
        ? new Response("Busy", { status: 504 })
        : new Response(JSON.stringify({ elements: [] }));
    };
    const result = await fetchStreetElements("[out:json];node(1);out;");
    assert.equal(
      result.endpoint,
      "https://overpass.private.coffee/api/interpreter",
    );
    assert.equal(calls.length, 2);
    globalThis.fetch = async () => {
      throw Object.assign(new Error("fetch failed"), {
        cause: { code: "ENOTFOUND" },
      });
    };
    await assert.rejects(
      () => fetchStreetElements("query"),
      (error) =>
        error.status === 503 &&
        /DNS lookup failed/.test(error.message) &&
        /overpass-api.de/.test(error.message) &&
        /overpass.private.coffee/.test(error.message),
    );
    let limitedCalls = 0;
    globalThis.fetch = async () => {
      limitedCalls++;
      return new Response("Rate limited", { status: 429 });
    };
    await assert.rejects(
      () => fetchStreetElements("query"),
      (error) => error.status === 429 && /rate-limited/.test(error.message),
    );
    assert.equal(limitedCalls, 1);
    globalThis.fetch = async () => new Response("Bad query", { status: 400 });
    await assert.rejects(
      () => fetchStreetElements("query"),
      (error) => error.status === 502 && /HTTP 400/.test(error.message),
    );
    globalThis.fetch = async () => {
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    };
    await assert.rejects(() => fetchStreetElements("query"), /timed out/);
    globalThis.fetch = async () => new Response("<html>not json</html>");
    await assert.rejects(() => fetchStreetElements("query"), /invalid JSON/);
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ remark: "runtime error", elements: [] }));
    await assert.rejects(
      () => fetchStreetElements("query"),
      /could not complete/,
    );
    process.env.OVERPASS_URL = "https://configured.example/api/interpreter";
    globalThis.fetch = async (url) => {
      assert.equal(url, process.env.OVERPASS_URL);
      return new Response(JSON.stringify({ elements: [] }));
    };
    assert.equal(
      (await fetchStreetElements("query")).endpoint,
      process.env.OVERPASS_URL,
    );
    process.env.OVERPASS_URL = "http://invalid.example/api/interpreter";
    await assert.rejects(
      () => fetchStreetElements("query"),
      /must be an HTTPS/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousURL === undefined) delete process.env.OVERPASS_URL;
    else process.env.OVERPASS_URL = previousURL;
  }
});

test("routing deadlines allow the Overpass queue and both backend attempts", async () => {
  const { OVERPASS_QUERY_SECONDS, OVERPASS_HTTP_TIMEOUT_MS, ROUTE_TIMEOUT_MS } =
    await import("../shared/network.mjs");
  assert.ok(
    OVERPASS_HTTP_TIMEOUT_MS >= (15 + OVERPASS_QUERY_SECONDS) * 1000 + 5000,
    "HTTP must allow queue, query and transfer time",
  );
  assert.ok(
    ROUTE_TIMEOUT_MS >= OVERPASS_HTTP_TIMEOUT_MS * 2 + 5000,
    "browser must outlive both attempts and response processing",
  );
  const { fetchStreetElements } = await import("../backend/overpass.mjs");
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.signal.aborted, false);
      return new Response(JSON.stringify({ elements: [] }));
    };
    await fetchStreetElements("query");
  } finally {
    globalThis.fetch = previous;
  }
});
