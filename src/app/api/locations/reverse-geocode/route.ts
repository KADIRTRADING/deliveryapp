import { NextRequest, NextResponse } from "next/server";
import { getMapProvider } from "@/modules/locations/map-provider";
import { reverseGeocodeQuerySchema } from "@/modules/locations/schemas";
import { handleApiError, ApiError } from "@/lib/api-error";
import { RateLimits, getClientIp } from "@/lib/rate-limit";

/**
 * GET /api/locations/reverse-geocode?lat=...&lng=...
 *
 * Reverse geocoding — used after the user "moves the map" / "drops a pin"
 * (steps 3-4 of the interactive map flow) to show a human-readable address
 * for the pin's current position before the user confirms it.
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const limit = await RateLimits.geocodePerIp(ip);
    if (!limit.allowed) {
      throw ApiError.tooManyRequests("Too many requests. Try again shortly.");
    }

    const input = reverseGeocodeQuerySchema.parse({
      lat: req.nextUrl.searchParams.get("lat"),
      lng: req.nextUrl.searchParams.get("lng"),
    });

    const provider = getMapProvider();
    const result = await provider.reverseGeocode(input.lat, input.lng);

    return NextResponse.json({ result }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
