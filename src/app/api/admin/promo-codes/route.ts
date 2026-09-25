import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { listPromoCodes, createPromoCode } from "@/modules/promotions/admin-promotions.service";
import { createPromoCodeSchema } from "@/modules/promotions/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

/** GET /api/admin/promo-codes — list all promo codes. Admin only. */
export async function GET() {
  try {
    await requireRole("ADMIN", "SUPER_ADMIN");
    const promoCodes = await listPromoCodes();
    return NextResponse.json({ promoCodes }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** POST /api/admin/promo-codes — create a new promo code. Admin only. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "SUPER_ADMIN");
    const body = await req.json();
    const input = createPromoCodeSchema.parse(body);

    const promoCode = await createPromoCode(input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "PROMO_CODE_CREATED",
      entityType: "PromoCode",
      entityId: promoCode.id,
    });

    return NextResponse.json({ promoCode }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
