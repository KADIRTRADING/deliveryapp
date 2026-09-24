import "server-only";
import { haversineDistanceMeters, isPointInPolygon, isWithinRadius } from "@/lib/geo";

/**
 * Shared geofencing helper used by both restaurant discovery
 * (listServiceableRestaurants) and global search (Phase 3's /api/search) so
 * "can this restaurant actually deliver here" is computed identically
 * everywhere it's asked, rather than two subtly-diverging implementations.
 */

export interface BranchForServiceability {
  latitude: number;
  longitude: number;
  deliveryZones: Array<{
    isActive: boolean;
    type: "RADIUS" | "POLYGON";
    radiusMeters: number | null;
    polygon: unknown;
  }>;
}

export interface ServiceabilityResult {
  isServiceable: boolean;
  nearestBranchDistanceMeters: number | null;
}

/**
 * `point` is undefined in "browse mode" (no customer location known yet) —
 * in that case every restaurant is considered serviceable (no exclusion),
 * and no distance is computed, matching the documented fallback behavior.
 */
export function computeServiceability(
  branches: BranchForServiceability[],
  point: { latitude: number; longitude: number } | undefined,
): ServiceabilityResult {
  if (!point) {
    return { isServiceable: true, nearestBranchDistanceMeters: null };
  }

  let isServiceable = false;
  let nearestBranchDistanceMeters: number | null = null;

  for (const branch of branches) {
    const distance = haversineDistanceMeters(point, {
      latitude: branch.latitude,
      longitude: branch.longitude,
    });
    if (nearestBranchDistanceMeters === null || distance < nearestBranchDistanceMeters) {
      nearestBranchDistanceMeters = distance;
    }

    const servesPoint = branch.deliveryZones.some((zone) => {
      if (!zone.isActive) return false;
      if (zone.type === "RADIUS" && zone.radiusMeters) {
        return isWithinRadius(
          point,
          { latitude: branch.latitude, longitude: branch.longitude },
          zone.radiusMeters,
        );
      }
      if (zone.type === "POLYGON" && Array.isArray(zone.polygon)) {
        return isPointInPolygon(point, zone.polygon as Array<[number, number]>);
      }
      return false;
    });
    if (servesPoint) isServiceable = true;
  }

  return { isServiceable, nearestBranchDistanceMeters };
}
