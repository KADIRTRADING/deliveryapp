import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { advanceDeliveryStatus } from "@/modules/couriers/couriers.service";
import { advanceDeliveryStatusSchema } from "@/modules/couriers/schemas";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/couriers/me/assignments/:id/status — advance the delivery
 * through PICKED_UP -> ON_THE_WAY -> DELIVERED. Only the courier holding
 * this assignment may advance it.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireRole("COURIER");
    const { id } = await params;
    const body = await req.json();
    const input = advanceDeliveryStatusSchema.parse(body);

    const assignment = await advanceDeliveryStatus(session, id, input.status);

    return NextResponse.json({ assignment }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
