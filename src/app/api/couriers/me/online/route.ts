import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { setOnlineStatus } from "@/modules/couriers/couriers.service";
import { updateOnlineStatusSchema } from "@/modules/couriers/schemas";
import { handleApiError } from "@/lib/api-error";

/** PATCH /api/couriers/me/online — go online/offline. Courier only. */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireRole("COURIER");
    const body = await req.json();
    const input = updateOnlineStatusSchema.parse(body);

    const courier = await setOnlineStatus(session, input.isOnline);

    return NextResponse.json({ courier }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
