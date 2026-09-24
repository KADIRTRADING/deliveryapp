import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { updateRestaurantStatus } from "@/modules/restaurants/restaurants.service";
import { updateRestaurantStatusSchema } from "@/modules/restaurants/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/restaurants/:id/status — admin-only restaurant moderation:
 * approve, suspend, archive, or revert to pending. This is the ONLY path by
 * which a restaurant becomes APPROVED (and therefore discoverable by
 * customers) — self-service restaurant creation always starts PENDING.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireRole("ADMIN", "SUPER_ADMIN");
    const { id } = await params;
    const body = await req.json();
    const input = updateRestaurantStatusSchema.parse(body);

    const restaurant = await updateRestaurantStatus(id, input.status);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "RESTAURANT_STATUS_CHANGED",
      entityType: "Restaurant",
      entityId: id,
      metadata: { status: input.status, reason: input.reason ?? null },
    });

    return NextResponse.json({ restaurant }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
