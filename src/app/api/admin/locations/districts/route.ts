import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { createDistrict } from "@/modules/admin/locations-admin.service";
import { createDistrictSchema } from "@/modules/admin/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

/** POST /api/admin/locations/districts — create a new district within a city. Admin only. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "SUPER_ADMIN");
    const body = await req.json();
    const input = createDistrictSchema.parse(body);

    const district = await createDistrict(input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "DISTRICT_CREATED",
      entityType: "District",
      entityId: district.id,
    });

    return NextResponse.json({ district }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
