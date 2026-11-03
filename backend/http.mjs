export function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
export function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
export function text(value, min = 1, max = 100) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    fail(422, `Enter text between ${min} and ${max} characters.`);
  return value.trim();
}
