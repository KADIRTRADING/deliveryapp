import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { requireBranchAccess } from "@/modules/restaurants/access";
import {
  listDeliveryZones,
  createDeliveryZone,
} from "@/modules/restaurants/delivery-zones.service";
import { createDeliveryZoneSchema } from "@/modules/restaurants/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/branches/:id/delivery-zones — list delivery zones for a branch. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireBranchAccess(session, id);
    const zones = await listDeliveryZones(id);
    return NextResponse.json({ deliveryZones: zones }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/branches/:id/delivery-zones — owner/admin: define a
 * radius- or polygon-based delivery zone with base + per-km fee, minimum
 * order, and estimated delivery time window. This is the data that
 * checkout's server-side zone verification (Phase 4) will validate customer
 * coordinates against — never trust a client-supplied "in zone" claim.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireBranchAccess(session, id, { roles: ["OWNER"] });

    const body = await req.json();
    const input = createDeliveryZoneSchema.parse(body);
    const zone = await createDeliveryZone(id, input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "DELIVERY_ZONE_CREATED",
      entityType: "DeliveryZone",
      entityId: zone.id,
      metadata: { branchId: id },
    });

    return NextResponse.json({ deliveryZone: zone }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
