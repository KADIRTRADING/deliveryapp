import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { requireMenuCategoryAccess } from "@/modules/restaurants/access";
import { updateMenuCategory, deleteMenuCategory } from "@/modules/menu/menu-categories.service";
import { updateMenuCategorySchema } from "@/modules/menu/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH /api/menu-categories/:id — owner/staff/admin: edit a menu category. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireMenuCategoryAccess(session, id, { roles: ["OWNER", "STAFF"] });

    const body = await req.json();
    const input = updateMenuCategorySchema.parse(body);
    const category = await updateMenuCategory(id, input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "MENU_CATEGORY_UPDATED",
      entityType: "MenuCategory",
      entityId: id,
    });

    return NextResponse.json({ menuCategory: category }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE /api/menu-categories/:id — owner/admin: remove a menu category (must be empty). */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireMenuCategoryAccess(session, id, { roles: ["OWNER"] });

    await deleteMenuCategory(id);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "MENU_CATEGORY_DELETED",
      entityType: "MenuCategory",
      entityId: id,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
