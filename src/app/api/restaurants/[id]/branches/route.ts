import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { requireRestaurantAccess } from "@/modules/restaurants/access";
import { listBranches, createBranch } from "@/modules/restaurants/branches.service";
import { createBranchSchema } from "@/modules/restaurants/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/restaurants/:id/branches — list branches for management (owner/staff/admin). */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireRestaurantAccess(session, id);
    const branches = await listBranches(id);
    return NextResponse.json({ branches }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/restaurants/:id/branches — owner/admin: add a new branch.
 * Implements "Restaurant → Branch → Location → Delivery Zone": every branch
 * requires real coordinates and a validated region/city/district reference.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireRestaurantAccess(session, id, { roles: ["OWNER"] });

    const body = await req.json();
    const input = createBranchSchema.parse(body);
    const branch = await createBranch(id, input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "BRANCH_CREATED",
      entityType: "RestaurantBranch",
      entityId: branch.id,
      metadata: { restaurantId: id },
    });

    return NextResponse.json({ branch }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
