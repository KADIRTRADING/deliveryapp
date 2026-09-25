import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { requireBranchAccess } from "@/modules/restaurants/access";
import { getOrderForRestaurant } from "@/modules/orders/orders.service";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ id: string; orderId: string }>;
}

/** GET /api/branches/:id/orders/:orderId — restaurant dashboard order detail. Owner/staff/admin only. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id, orderId } = await params;
    await requireBranchAccess(session, id);

    const order = await getOrderForRestaurant(id, orderId);
    return NextResponse.json({ order }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
