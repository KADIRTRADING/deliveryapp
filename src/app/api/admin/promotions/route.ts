import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { listPromotions, createPromotion } from "@/modules/promotions/admin-promotions.service";
import { createPromotionSchema } from "@/modules/promotions/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

/** GET /api/admin/promotions — list restaurant/product-scoped automatic promotions. Admin only. */
export async function GET() {
  try {
    await requireRole("ADMIN", "SUPER_ADMIN");
    const promotions = await listPromotions();
    return NextResponse.json({ promotions }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** POST /api/admin/promotions — create a restaurant- or product-scoped automatic promotion. Admin only. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "SUPER_ADMIN");
    const body = await req.json();
    const input = createPromotionSchema.parse(body);

    const promotion = await createPromotion(input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "PROMOTION_CREATED",
      entityType: "Promotion",
      entityId: promotion.id,
    });

    return NextResponse.json({ promotion }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
