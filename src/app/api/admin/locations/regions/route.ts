import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { createRegion } from "@/modules/admin/locations-admin.service";
import { createRegionSchema } from "@/modules/admin/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

/** POST /api/admin/locations/regions — create a new region. Admin only. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "SUPER_ADMIN");
    const body = await req.json();
    const input = createRegionSchema.parse(body);

    const region = await createRegion(input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "REGION_CREATED",
      entityType: "Region",
      entityId: region.id,
    });

    return NextResponse.json({ region }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
