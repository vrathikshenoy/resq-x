export function parseCoordinates(value) {
  const parts = value.split(",").map((s) => s.trim());
  if (
    parts.length !== 2 ||
    parts.some((s) => s === "" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))
  )
    throw new Error("Enter latitude, longitude or choose a point on the map.");
  const point = parts.map(Number);
  if (Math.abs(point[0]) > 85 || Math.abs(point[1]) > 179.9)
    throw new Error("Coordinates are outside the supported map area.");
  return point;
}
export function project([lat, lon], zoom) {
  const size = 256 * 2 ** zoom,
    sin = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return [
    ((lon + 180) / 360) * size,
    (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  ];
}
export function unproject([x, y], zoom) {
  const size = 256 * 2 ** zoom;
  return [
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI,
    (x / size) * 360 - 180,
  ];
}
export function fitMap(points, width, height) {
  const list = points.length ? points : [[12.975, 77.59]];
  let zoom = 17;
  for (; zoom > 2; zoom--) {
    const p = list.map((v) => project(v, zoom));
    if (
      Math.max(...p.map((v) => v[0])) - Math.min(...p.map((v) => v[0])) <
        width - 90 &&
      Math.max(...p.map((v) => v[1])) - Math.min(...p.map((v) => v[1])) <
        height - 90
    )
      break;
  }
  const p = list.map((v) => project(v, zoom));
  return {
    zoom,
    center: unproject(
      [
        (Math.min(...p.map((v) => v[0])) + Math.max(...p.map((v) => v[0]))) / 2,
        (Math.min(...p.map((v) => v[1])) + Math.max(...p.map((v) => v[1]))) / 2,
      ],
      zoom,
    ),
  };
}
