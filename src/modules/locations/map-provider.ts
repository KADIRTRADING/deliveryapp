import "server-only";
import { env, assertProductionCredentials } from "@/lib/env";

/**
 * MapProvider abstraction.
 *
 * Per the platform requirement to design the map layer through an
 * abstraction so the provider can be swapped later, and to never expose
 * private API keys to the client: every method here runs server-side only,
 * and the concrete provider is chosen purely by `MAP_PROVIDER` env var. The
 * client never receives a raw provider API key — for interactive map
 * rendering, the client instead calls our own `/api/locations/*` endpoints,
 * which proxy to this abstraction (see route handlers in
 * src/app/api/locations).
 *
 * If a future client-side interactive map widget needs a *scoped, short-lived*
 * public token (e.g. Mapbox supports public tokens restricted to specific
 * URLs), that would be minted by a dedicated endpoint here, never read
 * directly from environment variables by client code.
 */

export interface GeocodeResult {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  /** Provider-specific relevance/confidence score, 0-1 where available. */
  relevance?: number;
}

export interface MapProvider {
  /** Forward geocoding: turn a free-text address query into candidate coordinates. */
  geocode(
    query: string,
    opts?: { countryCode?: string; proximity?: { lat: number; lng: number } },
  ): Promise<GeocodeResult[]>;

  /** Reverse geocoding: turn coordinates into a human-readable address. */
  reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null>;
}

/**
 * Development/test adapter. Returns deterministic, clearly-labeled stub
 * results so the address-search UI and delivery flows are fully exercisable
 * end-to-end (including the "search for an address" step of the map
 * requirement) without any external API key. Never used in production —
 * enforced by `getMapProvider()` below.
 */
class MockMapProvider implements MapProvider {
  async geocode(query: string): Promise<GeocodeResult[]> {
    // Center the stub result near Tashkent so it's plausible on a map centered
    // on Uzbekistan during local development.
    return [
      {
        formattedAddress: `[DEV STUB] ${query}, Tashkent, Uzbekistan`,
        latitude: 41.2995,
        longitude: 69.2401,
        relevance: 1,
      },
    ];
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
    return {
      formattedAddress: `[DEV STUB] Address near ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      latitude: lat,
      longitude: lng,
      relevance: 1,
    };
  }
}

/**
 * Mapbox adapter, using the server-side Geocoding API v6. Requires
 * MAPBOX_SERVER_TOKEN — a *secret* (sk.*) token, kept server-side only. See
 * README "Maps" section for how to obtain one and restrict its scopes.
 */
class MapboxMapProvider implements MapProvider {
  private readonly baseUrl = "https://api.mapbox.com/search/geocode/v6";

  async geocode(
    query: string,
    opts?: { countryCode?: string; proximity?: { lat: number; lng: number } },
  ): Promise<GeocodeResult[]> {
    const params = new URLSearchParams({
      q: query,
      access_token: env.MAPBOX_SERVER_TOKEN ?? "",
      country: opts?.countryCode ?? "uz",
      language: "uz",
      limit: "5",
    });
    if (opts?.proximity) {
      params.set("proximity", `${opts.proximity.lng},${opts.proximity.lat}`);
    }

    const res = await fetch(`${this.baseUrl}/forward?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Mapbox geocode failed with status ${res.status}`);
    }
    const data = (await res.json()) as MapboxFeatureCollection;

    return data.features.map((feature) => ({
      formattedAddress: feature.properties.full_address ?? feature.properties.name,
      latitude: feature.geometry.coordinates[1],
      longitude: feature.geometry.coordinates[0],
      relevance: feature.properties.match_code?.confidence === "exact" ? 1 : 0.6,
    }));
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
    const params = new URLSearchParams({
      longitude: String(lng),
      latitude: String(lat),
      access_token: env.MAPBOX_SERVER_TOKEN ?? "",
      language: "uz",
    });

    const res = await fetch(`${this.baseUrl}/reverse?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Mapbox reverse geocode failed with status ${res.status}`);
    }
    const data = (await res.json()) as MapboxFeatureCollection;
    const first = data.features[0];
    if (!first) return null;

    return {
      formattedAddress: first.properties.full_address ?? first.properties.name,
      latitude: first.geometry.coordinates[1],
      longitude: first.geometry.coordinates[0],
    };
  }
}

interface MapboxFeatureCollection {
  features: Array<{
    properties: {
      full_address?: string;
      name: string;
      match_code?: { confidence?: string };
    };
    geometry: { coordinates: [number, number] };
  }>;
}

let cachedProvider: MapProvider | null = null;

export function getMapProvider(): MapProvider {
  if (cachedProvider) return cachedProvider;

  if (env.MAP_PROVIDER === "mapbox") {
    assertProductionCredentials("Mapbox", [env.MAPBOX_SERVER_TOKEN]);
    cachedProvider = new MapboxMapProvider();
  } else {
    cachedProvider = new MockMapProvider();
  }
  return cachedProvider;
}
