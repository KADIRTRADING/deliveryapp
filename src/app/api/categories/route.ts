import { NextRequest, NextResponse } from "next/server";
import { listCategories, createCategory } from "@/modules/restaurants/categories.service";
import { createCategorySchema } from "@/modules/restaurants/schemas";
import { requireRole } from "@/modules/auth/rbac";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

/** GET /api/categories — public list of restaurant categories/cuisines. */
export async function GET() {
  try {
    const categories = await listCategories();
    return NextResponse.json({ categories }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** POST /api/categories — admin-only: create a new restaurant category. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "SUPER_ADMIN");
    const body = await req.json();
    const input = createCategorySchema.parse(body);

    const category = await createCategory(input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "CATEGORY_CREATED",
      entityType: "RestaurantCategory",
      entityId: category.id,
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
