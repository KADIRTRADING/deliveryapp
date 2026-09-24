import { NextRequest, NextResponse } from "next/server";
import {
  listServiceableRestaurants,
  createRestaurant,
} from "@/modules/restaurants/restaurants.service";
import { createRestaurantSchema, restaurantListQuerySchema } from "@/modules/restaurants/schemas";
import { requireRole } from "@/modules/auth/rbac";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

/**
 * GET /api/restaurants — public restaurant discovery. If `lat`/`lng` are
 * supplied, results are filtered to restaurants that can actually deliver
 * to that point (see listServiceableRestaurants) and sorted by real
 * distance to the nearest servicing branch — never a fake/estimated value.
 */
export async function GET(req: NextRequest) {
  try {
    const query = restaurantListQuerySchema.parse({
      lat: req.nextUrl.searchParams.get("lat") ?? undefined,
      lng: req.nextUrl.searchParams.get("lng") ?? undefined,
      cityId: req.nextUrl.searchParams.get("cityId") ?? undefined,
      categorySlug: req.nextUrl.searchParams.get("categorySlug") ?? undefined,
      page: req.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: req.nextUrl.searchParams.get("pageSize") ?? undefined,
    });

    const result = await listServiceableRestaurants(query);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/restaurants — a RESTAURANT_OWNER creates their own restaurant
 * profile. Always starts in PENDING status; an admin must approve it (see
 * /api/admin/restaurants/:id/status in Phase 6) before it is discoverable
 * by customers.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("RESTAURANT_OWNER", "ADMIN", "SUPER_ADMIN");
    const body = await req.json();
    const input = createRestaurantSchema.parse(body);

    const restaurant = await createRestaurant(session, input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "RESTAURANT_CREATED",
      entityType: "Restaurant",
      entityId: restaurant.id,
    });

    return NextResponse.json({ restaurant }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
