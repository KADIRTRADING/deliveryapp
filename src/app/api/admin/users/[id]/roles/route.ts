import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { modifyUserRole } from "@/modules/admin/users.service";
import { modifyUserRoleSchema } from "@/modules/admin/schemas";
import { handleApiError, ApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/admin/users/:id/roles — grant or revoke a single role.
 * SUPER_ADMIN only for granting/revoking ADMIN or SUPER_ADMIN itself (a
 * plain ADMIN must not be able to escalate their own or another account to
 * the platform's highest privilege level) — all other role changes are
 * available to any ADMIN.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireRole("ADMIN", "SUPER_ADMIN");
    const { id } = await params;
    const body = await req.json();
    const input = modifyUserRoleSchema.parse(body);

    const isSuperAdmin = session.user.roles.includes("SUPER_ADMIN");
    if ((input.role === "ADMIN" || input.role === "SUPER_ADMIN") && !isSuperAdmin) {
      throw ApiError.forbidden("Only a super admin may grant or revoke admin-level roles.");
    }
    if (id === session.user.id && input.action === "REVOKE") {
      throw ApiError.badRequest("You cannot revoke your own role.");
    }

    const user = await modifyUserRole(id, input.role, input.action);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "USER_ROLE_MODIFIED",
      entityType: "User",
      entityId: id,
      metadata: { role: input.role, roleAction: input.action },
    });

    return NextResponse.json({ user }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
