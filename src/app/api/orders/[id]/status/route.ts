import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { advanceOrderStatus } from "@/modules/orders/orders.service";
import { advanceOrderStatusSchema } from "@/modules/orders/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/orders/:id/status — restaurant staff/owner/admin (and, from
 * Phase 8, couriers) advance an order to a new status. Every rule
 * (legal transition, actor role, branch access) is enforced inside
 * advanceOrderStatus — this route is a thin wrapper.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await req.json();
    const input = advanceOrderStatusSchema.parse(body);

    await advanceOrderStatus(session, id, input.status, { reason: input.reason });

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "ORDER_STATUS_CHANGED",
      entityType: "Order",
      entityId: id,
      metadata: { status: input.status, reason: input.reason ?? null },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
