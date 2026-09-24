/**
 * Pure geospatial utilities — no I/O, no framework dependencies, so these are
 * trivially unit-testable and reusable from both API route handlers and
 * background jobs (e.g. a future courier-matching worker).
 *
 * Used for delivery-zone membership checks (radius and polygon), and for
 * server-side distance-based delivery fee calculation. Per the platform
 * requirement "Never trust client-supplied distance", every distance used in
 * a financial calculation MUST be computed here from raw coordinates, never
 * accepted as an API input field.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two coordinates using the Haversine formula,
 * in meters. Accurate enough for intra-city delivery distances (error is a
 * few meters at most over tens of kilometers) without needing a full
 * geodesic library.
 */
export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_METERS * c;
}

export function isWithinRadius(point: LatLng, center: LatLng, radiusMeters: number): boolean {
  return haversineDistanceMeters(point, center) <= radiusMeters;
}

/**
 * Point-in-polygon test using the ray casting algorithm. `polygon` is an
 * array of [longitude, latitude] pairs (GeoJSON coordinate order — note this
 * is [lng, lat], NOT [lat, lng]), matching how DeliveryZone.polygon is
 * stored. The polygon is treated as implicitly closed (the last point does
 * not need to repeat the first).
 *
 * This is planar (flat-earth) ray casting, not geodesic — acceptable for
 * city-scale delivery zone polygons (a few kilometers across) where the
 * curvature-induced error is negligible.
 */
export function isPointInPolygon(point: LatLng, polygon: Array<[number, number]>): boolean {
  if (polygon.length < 3) return false;

  const x = point.longitude;
  const y = point.latitude;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const currentPoint = polygon[i];
    const previousPoint = polygon[j];
    if (!currentPoint || !previousPoint) continue;
    const [xi, yi] = currentPoint;
    const [xj, yj] = previousPoint;

    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

export function metersToKilometers(meters: number): number {
  return meters / 1000;
}
