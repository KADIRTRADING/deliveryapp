import { describe, expect, it } from "vitest";
import { haversineDistanceMeters, isWithinRadius, isPointInPolygon } from "@/lib/geo";

describe("haversineDistanceMeters", () => {
  it("returns ~0 for identical points", () => {
    const point = { latitude: 41.2995, longitude: 69.2401 };
    expect(haversineDistanceMeters(point, point)).toBeCloseTo(0, 1);
  });

  it("computes a plausible distance between two known Tashkent landmarks", () => {
    // Amir Timur Square to Tashkent International Airport — roughly 6-7 km apart.
    const amirTimurSquare = { latitude: 41.311, longitude: 69.2797 };
    const airport = { latitude: 41.2579, longitude: 69.2812 };
    const distance = haversineDistanceMeters(amirTimurSquare, airport);
    expect(distance).toBeGreaterThan(4000);
    expect(distance).toBeLessThan(10000);
  });

  it("is symmetric", () => {
    const a = { latitude: 41.3, longitude: 69.24 };
    const b = { latitude: 41.35, longitude: 69.3 };
    expect(haversineDistanceMeters(a, b)).toBeCloseTo(haversineDistanceMeters(b, a), 6);
  });
});

describe("isWithinRadius", () => {
  const center = { latitude: 41.2995, longitude: 69.2401 };

  it("returns true for a point at the center", () => {
    expect(isWithinRadius(center, center, 1000)).toBe(true);
  });

  it("returns false for a point clearly outside the radius", () => {
    const farPoint = { latitude: 42.5, longitude: 70.5 }; // >100km away
    expect(isWithinRadius(farPoint, center, 5000)).toBe(false);
  });

  it("returns true for a point just inside a generous radius", () => {
    const nearbyPoint = { latitude: 41.301, longitude: 69.2415 };
    expect(isWithinRadius(nearbyPoint, center, 5000)).toBe(true);
  });
});

describe("isPointInPolygon", () => {
  // A simple square around central Tashkent, in [lng, lat] GeoJSON order.
  const square: Array<[number, number]> = [
    [69.2, 41.25],
    [69.3, 41.25],
    [69.3, 41.35],
    [69.2, 41.35],
  ];

  it("returns true for a point inside the polygon", () => {
    expect(isPointInPolygon({ latitude: 41.3, longitude: 69.25 }, square)).toBe(true);
  });

  it("returns false for a point outside the polygon", () => {
    expect(isPointInPolygon({ latitude: 42.0, longitude: 70.0 }, square)).toBe(false);
  });

  it("returns false for a degenerate polygon with fewer than 3 points", () => {
    expect(
      isPointInPolygon({ latitude: 41.3, longitude: 69.25 }, [
        [69.2, 41.25],
        [69.3, 41.25],
      ]),
    ).toBe(false);
  });
});
