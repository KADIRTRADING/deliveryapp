import { describe, expect, it } from "vitest";
import { buildNavigationUrl } from "@/modules/couriers/couriers.service";

describe("buildNavigationUrl", () => {
  it("builds a Google Maps directions URL with the correct origin and destination", () => {
    const origin = { latitude: 41.311, longitude: 69.2797 };
    const destination = { latitude: 41.2995, longitude: 69.2401 };

    const url = buildNavigationUrl(origin, destination);
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toEqual("https://www.google.com/maps/dir/");
    expect(parsed.searchParams.get("api")).toEqual("1");
    expect(parsed.searchParams.get("origin")).toEqual("41.311,69.2797");
    expect(parsed.searchParams.get("destination")).toEqual("41.2995,69.2401");
    expect(parsed.searchParams.get("travelmode")).toEqual("driving");
  });

  it("produces a valid, parseable URL for arbitrary coordinates", () => {
    const url = buildNavigationUrl(
      { latitude: -12.5, longitude: 45.123456 },
      { latitude: 89.9, longitude: -179.9 },
    );
    expect(() => new URL(url)).not.toThrow();
  });
});
