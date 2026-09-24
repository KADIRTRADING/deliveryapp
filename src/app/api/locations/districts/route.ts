import { NextRequest, NextResponse } from "next/server";
import { listDistricts } from "@/modules/locations/locations.service";
import { listDistrictsQuerySchema } from "@/modules/locations/schemas";
import { handleApiError } from "@/lib/api-error";

/** GET /api/locations/districts?cityId=... — list districts within a city. */
export async function GET(req: NextRequest) {
  try {
    const { cityId } = listDistrictsQuerySchema.parse({
      cityId: req.nextUrl.searchParams.get("cityId"),
    });
    const districts = await listDistricts(cityId);
    return NextResponse.json({ districts }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
