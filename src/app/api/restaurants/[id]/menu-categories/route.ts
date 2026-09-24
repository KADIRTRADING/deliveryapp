import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { requireRestaurantAccess } from "@/modules/restaurants/access";
import { listMenuCategories, createMenuCategory } from "@/modules/menu/menu-categories.service";
import { createMenuCategorySchema } from "@/modules/menu/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/restaurants/:id/menu-categories — management list (owner/staff/admin). */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireRestaurantAccess(session, id);
    const categories = await listMenuCategories(id, { includeInactive: true });
    return NextResponse.json({ menuCategories: categories }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** POST /api/restaurants/:id/menu-categories — owner/staff/admin: create a menu category. */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireRestaurantAccess(session, id, { roles: ["OWNER", "STAFF"] });

    const body = await req.json();
    const input = createMenuCategorySchema.parse(body);
    const category = await createMenuCategory(id, input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "MENU_CATEGORY_CREATED",
      entityType: "MenuCategory",
      entityId: category.id,
      metadata: { restaurantId: id },
    });

    return NextResponse.json({ menuCategory: category }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
