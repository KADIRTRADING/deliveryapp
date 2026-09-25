import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { updateLocation } from "@/modules/couriers/couriers.service";
import { updateCourierLocationSchema } from "@/modules/couriers/schemas";
import { handleApiError } from "@/lib/api-error";

/**
 * PATCH /api/couriers/me/location — update the authenticated courier's
 * live location. Courier only; this location is never exposed through any
 * public endpoint (see getAssignmentLocationForOrder for the only
 * authorized read path).
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireRole("COURIER");
    const body = await req.json();
    const input = updateCourierLocationSchema.parse(body);

    await updateLocation(session, input.latitude, input.longitude);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
