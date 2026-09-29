export const LOCATION_TTL_MS = 24 * 60 * 60 * 1000;
export const NEARBY_RADIUS_KM = 10;

export function validPoint(point) {
  return Number.isFinite(point?.lat) && Number.isFinite(point?.lng)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180
    && !(point.lat === 0 && point.lng === 0);
}

export function activeLocation(point, now = Date.now()) {
  const at = Date.parse(point?.at || "");
  if (!validPoint(point) || !Number.isFinite(at) || at > now || now - at >= LOCATION_TTL_MS) return null;
  return { lat: point.lat, lng: point.lng, at: new Date(at).toISOString(), expiresAt: new Date(at + LOCATION_TTL_MS).toISOString() };
}

export function distanceKm(from, to) {
  if (!validPoint(from) || !validPoint(to)) return null;
  const radians = (value) => value * Math.PI / 180;
  const a = Math.sin(radians(to.lat - from.lat) / 2) ** 2
    + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(radians(to.lng - from.lng) / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
