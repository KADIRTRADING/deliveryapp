import { NextResponse } from "next/server";
import { listRegions } from "@/modules/locations/locations.service";
import { handleApiError } from "@/lib/api-error";

/** GET /api/locations/regions — list all Uzbekistan regions (public, no auth required). */
export async function GET() {
  try {
    const regions = await listRegions();
    return NextResponse.json({ regions }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
