import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { updateUserStatus } from "@/modules/admin/users.service";
import { updateUserStatusSchema } from "@/modules/admin/schemas";
import { handleApiError, ApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/admin/users/:id/status — suspend or reactivate a user account.
 * Admin only. Suspension immediately revokes all of the user's sessions.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireRole("ADMIN", "SUPER_ADMIN");
    const { id } = await params;

    if (id === session.user.id) {
      throw ApiError.badRequest("You cannot change your own account status.");
    }

    const body = await req.json();
    const input = updateUserStatusSchema.parse(body);

    const user = await updateUserStatus(id, input.status);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "USER_STATUS_CHANGED",
      entityType: "User",
      entityId: id,
      metadata: { status: input.status, reason: input.reason ?? null },
    });

    return NextResponse.json({ user }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
