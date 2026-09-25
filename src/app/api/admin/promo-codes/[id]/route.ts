import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { updatePromoCode } from "@/modules/promotions/admin-promotions.service";
import { updatePromoCodeSchema } from "@/modules/promotions/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH /api/admin/promo-codes/:id — deactivate/update a promo code. Admin only. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireRole("ADMIN", "SUPER_ADMIN");
    const { id } = await params;
    const body = await req.json();
    const input = updatePromoCodeSchema.parse(body);

    const promoCode = await updatePromoCode(id, input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "PROMO_CODE_UPDATED",
      entityType: "PromoCode",
      entityId: id,
    });

    return NextResponse.json({ promoCode }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
