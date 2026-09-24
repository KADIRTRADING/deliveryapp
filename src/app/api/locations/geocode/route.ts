import { NextRequest, NextResponse } from "next/server";
import { getMapProvider } from "@/modules/locations/map-provider";
import { geocodeQuerySchema } from "@/modules/locations/schemas";
import { handleApiError, ApiError } from "@/lib/api-error";
import { RateLimits, getClientIp } from "@/lib/rate-limit";

/**
 * GET /api/locations/geocode?q=...&lat=...&lng=...
 *
 * Forward geocoding ("search for an address") — step 2 of the interactive
 * map location flow. Proxies to the server-side MapProvider so the client
 * never talks to (or holds a key for) the underlying map vendor directly.
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const limit = await RateLimits.geocodePerIp(ip);
    if (!limit.allowed) {
      throw ApiError.tooManyRequests("Too many search requests. Try again shortly.");
    }

    const input = geocodeQuerySchema.parse({
      q: req.nextUrl.searchParams.get("q"),
      lat: req.nextUrl.searchParams.get("lat") ?? undefined,
      lng: req.nextUrl.searchParams.get("lng") ?? undefined,
    });

    const provider = getMapProvider();
    const results = await provider.geocode(input.q, {
      countryCode: "uz",
      proximity:
        input.lat !== undefined && input.lng !== undefined
          ? { lat: input.lat, lng: input.lng }
          : undefined,
    });

    return NextResponse.json({ results }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
