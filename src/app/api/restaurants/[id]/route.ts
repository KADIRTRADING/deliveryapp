import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { requireRestaurantAccess } from "@/modules/restaurants/access";
import {
  getRestaurantForManagement,
  updateRestaurant,
} from "@/modules/restaurants/restaurants.service";
import { updateRestaurantSchema } from "@/modules/restaurants/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/restaurants/:id — management-context lookup (owner/staff/admin
 * only; includes non-APPROVED restaurants). For public browsing, use
 * GET /api/restaurants/slug/:slug instead.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireRestaurantAccess(session, id);
    const restaurant = await getRestaurantForManagement(id);
    return NextResponse.json({ restaurant }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** PATCH /api/restaurants/:id — owner/staff/admin: edit restaurant profile fields. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireRestaurantAccess(session, id, { roles: ["OWNER"] });

    const body = await req.json();
    const input = updateRestaurantSchema.parse(body);
    const restaurant = await updateRestaurant(id, input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "RESTAURANT_UPDATED",
      entityType: "Restaurant",
      entityId: id,
    });

    return NextResponse.json({ restaurant }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
