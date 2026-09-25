import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { updateRestaurantCommission } from "@/modules/restaurants/restaurants.service";
import { updateCommissionSchema } from "@/modules/admin/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/admin/restaurants/:id/commission — set a restaurant's
 * platform commission rate in basis points (e.g. 1500 = 15.00%). Admin
 * only. This does not retroactively affect the restaurantEarningsAmount/
 * platformCommissionAmount already snapshotted onto existing orders — only
 * orders checked out after this change use the new rate.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireRole("ADMIN", "SUPER_ADMIN");
    const { id } = await params;
    const body = await req.json();
    const input = updateCommissionSchema.parse(body);

    const restaurant = await updateRestaurantCommission(id, input.commissionBps);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "RESTAURANT_COMMISSION_CHANGED",
      entityType: "Restaurant",
      entityId: id,
      metadata: { commissionBps: input.commissionBps },
    });

    return NextResponse.json({ restaurant }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
