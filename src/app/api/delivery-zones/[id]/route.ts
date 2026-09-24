import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { requireDeliveryZoneAccess } from "@/modules/restaurants/access";
import {
  updateDeliveryZone,
  deleteDeliveryZone,
} from "@/modules/restaurants/delivery-zones.service";
import { updateDeliveryZoneSchema } from "@/modules/restaurants/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH /api/delivery-zones/:id — owner/admin: edit a delivery zone's fees/shape/status. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireDeliveryZoneAccess(session, id, { roles: ["OWNER"] });

    const body = await req.json();
    const input = updateDeliveryZoneSchema.parse(body);
    const zone = await updateDeliveryZone(id, input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "DELIVERY_ZONE_UPDATED",
      entityType: "DeliveryZone",
      entityId: id,
    });

    return NextResponse.json({ deliveryZone: zone }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE /api/delivery-zones/:id — owner/admin: remove a delivery zone. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireDeliveryZoneAccess(session, id, { roles: ["OWNER"] });

    await deleteDeliveryZone(id);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "DELIVERY_ZONE_DELETED",
      entityType: "DeliveryZone",
      entityId: id,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
