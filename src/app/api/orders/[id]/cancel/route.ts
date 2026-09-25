import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { cancelOrderAsCustomer } from "@/modules/orders/orders.service";
import { cancelOrderSchema } from "@/modules/orders/schemas";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/orders/:id/cancel — customer-initiated cancellation, subject to
 * configurable rules (see CUSTOMER_CANCELLABLE_STATUSES in status-machine.ts).
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const input = cancelOrderSchema.parse(body);

    await cancelOrderAsCustomer(session, id, input.reason);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
