import { NextRequest, NextResponse } from "next/server";
import { listCities } from "@/modules/locations/locations.service";
import { listCitiesQuerySchema } from "@/modules/locations/schemas";
import { handleApiError } from "@/lib/api-error";

/** GET /api/locations/cities?regionId=... — list cities, optionally filtered by region. */
export async function GET(req: NextRequest) {
  try {
    const { regionId } = listCitiesQuerySchema.parse({
      regionId: req.nextUrl.searchParams.get("regionId") ?? undefined,
    });
    const cities = await listCities(regionId);
    return NextResponse.json({ cities }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
