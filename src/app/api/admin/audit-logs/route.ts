import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { listAuditLog } from "@/modules/admin/audit-log-query.service";
import { listAuditLogQuerySchema } from "@/modules/admin/schemas";
import { handleApiError } from "@/lib/api-error";

/**
 * GET /api/admin/audit-logs — view the platform's append-only audit trail,
 * optionally filtered by entity type/id or actor. Admin only.
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN", "SUPER_ADMIN");
    const params = req.nextUrl.searchParams;
    const query = listAuditLogQuerySchema.parse({
      entityType: params.get("entityType") ?? undefined,
      entityId: params.get("entityId") ?? undefined,
      actorUserId: params.get("actorUserId") ?? undefined,
      page: params.get("page") ?? undefined,
      pageSize: params.get("pageSize") ?? undefined,
    });

    const result = await listAuditLog(query);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
