import { fail } from "./http.mjs";
const publicEndpoints = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
function endpoints() {
  if (!process.env.OVERPASS_URL) return publicEndpoints;
  try {
    const url = new URL(process.env.OVERPASS_URL);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
    return [url.href];
  } catch {
    fail(
      500,
      "OVERPASS_URL must be an HTTPS interpreter URL without credentials or query parameters.",
    );
  }
}
function networkReason(error) {
  if (["AbortError", "TimeoutError"].includes(error.name))
    return "request timed out";
  const code = error.cause?.code || error.cause?.errors?.[0]?.code;
  if (["ENOTFOUND", "EAI_AGAIN"].includes(code))
    return `server DNS lookup failed (${code})`;
  if (typeof code === "string" && /^[A-Z0-9_]+$/.test(code))
    return `server connection failed (${code})`;
  return "server could not connect";
}
export async function fetchStreetElements(query) {
  const failures = [];
  for (const endpoint of endpoints()) {
    const host = new URL(endpoint).hostname;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "RESQ-X-prototype/0.1",
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(12000),
      });
      if (response.status === 429) {
        await response.body?.cancel();
        fail(
          429,
          `${host} rate-limited street-data requests (HTTP 429). Wait before retrying. No alternate service was contacted to bypass this limit.`,
        );
      }
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status >= 400 && response.status < 500)
          fail(
            502,
            `${host} rejected the street-data request (HTTP ${response.status}).`,
          );
        failures.push(`${host}: HTTP ${response.status}`);
        continue;
      }
      let size = 0;
      const chunks = [];
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 8000000)
          fail(
            422,
            "This street-data response exceeds 8 MB. Choose closer start and destination points.",
          );
        chunks.push(Buffer.from(chunk));
      }
      let data;
      try {
        data = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        failures.push(`${host}: invalid JSON response`);
        continue;
      }
      if (data?.remark) {
        failures.push(`${host}: query could not complete`);
        continue;
      }
      if (
        !Array.isArray(data?.elements) ||
        data.elements.some((e) => !e || typeof e !== "object")
      ) {
        failures.push(`${host}: invalid street-data response`);
        continue;
      }
      if (data.elements.length > 25000)
        fail(
          422,
          "This area contains too much street data. Choose closer start and destination points.",
        );
      return { elements: data.elements, endpoint };
    } catch (error) {
      if (error.status) throw error;
      failures.push(`${host}: ${networkReason(error)}`);
    }
  }
  fail(
    503,
    `Street data unavailable. ${failures.join("; ")}. Check the server’s internet/DNS connection or retry later. Map tiles use a separate service; sample routes have not been substituted.`,
  );
}
