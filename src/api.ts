import { ROUTE_TIMEOUT_MS } from "../shared/network.mjs";
export async function api<T = any>(
  path: string,
  data?: unknown,
  method = data ? "POST" : "GET",
): Promise<T> {
  const response = await fetch("/api/v1" + path, {
    method,
    credentials: "same-origin",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(
      path === "/navigation/route" ? ROUTE_TIMEOUT_MS : 30000,
    ),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Request failed. Please try again.");
  return result;
}
export type User = { id: string; name: string; email: string | null };
