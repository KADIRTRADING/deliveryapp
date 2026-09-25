import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { createCity } from "@/modules/admin/locations-admin.service";
import { createCitySchema } from "@/modules/admin/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

/** POST /api/admin/locations/cities — create a new city within a region. Admin only. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "SUPER_ADMIN");
    const body = await req.json();
    const input = createCitySchema.parse(body);

    const city = await createCity(input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "CITY_CREATED",
      entityType: "City",
      entityId: city.id,
    });

    return NextResponse.json({ city }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
