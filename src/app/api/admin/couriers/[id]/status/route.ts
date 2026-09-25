import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { updateCourierStatus } from "@/modules/admin/couriers.service";
import { updateCourierStatusSchema } from "@/modules/admin/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH /api/admin/couriers/:id/status — suspend or reactivate a courier. Admin only. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireRole("ADMIN", "SUPER_ADMIN");
    const { id } = await params;
    const body = await req.json();
    const input = updateCourierStatusSchema.parse(body);

    const courier = await updateCourierStatus(id, input.status);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "COURIER_STATUS_CHANGED",
      entityType: "Courier",
      entityId: id,
      metadata: { status: input.status },
    });

    return NextResponse.json({ courier }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
