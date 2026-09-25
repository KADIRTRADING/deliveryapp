import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { getOrderForCustomer } from "@/modules/orders/orders.service";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/orders/:id — fetch a single order owned by the authenticated customer. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const order = await getOrderForCustomer(session.user.id, id);
    return NextResponse.json({ order }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
