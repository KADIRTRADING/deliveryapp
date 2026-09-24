import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { requireBranchAccess } from "@/modules/restaurants/access";
import { updateBranch, deleteBranch } from "@/modules/restaurants/branches.service";
import { updateBranchSchema } from "@/modules/restaurants/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/branches/:id — owner/staff/admin: edit a branch (location,
 * hours, temporary closure, active flag). `requireBranchAccess` resolves the
 * branch's owning restaurant and checks membership, so staff scoped to only
 * this branch (RestaurantUser.branchId set) can still manage it.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireBranchAccess(session, id, { roles: ["OWNER", "STAFF"] });

    const body = await req.json();
    const input = updateBranchSchema.parse(body);
    const branch = await updateBranch(id, input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "BRANCH_UPDATED",
      entityType: "RestaurantBranch",
      entityId: id,
    });

    return NextResponse.json({ branch }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE /api/branches/:id — owner/admin only: soft-delete (deactivate) a branch. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireBranchAccess(session, id, { roles: ["OWNER"] });

    await deleteBranch(id);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "BRANCH_DELETED",
      entityType: "RestaurantBranch",
      entityId: id,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
