import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { listCouriers, createCourier } from "@/modules/admin/couriers.service";
import { createCourierSchema } from "@/modules/admin/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";
import { z } from "zod";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /api/admin/couriers — list courier accounts. Admin only. */
export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN", "SUPER_ADMIN");
    const { page, pageSize } = listQuerySchema.parse({
      page: req.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: req.nextUrl.searchParams.get("pageSize") ?? undefined,
    });
    const result = await listCouriers({ page, pageSize });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/admin/couriers — provision a courier profile for an existing
 * user account (granting the COURIER role if not already present). Admin only.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("ADMIN", "SUPER_ADMIN");
    const body = await req.json();
    const input = createCourierSchema.parse(body);

    const courier = await createCourier(input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "COURIER_CREATED",
      entityType: "Courier",
      entityId: courier.id,
      metadata: { userId: input.userId },
    });

    return NextResponse.json({ courier }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
