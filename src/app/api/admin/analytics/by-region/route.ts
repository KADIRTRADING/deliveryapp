import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { getOrdersByRegion } from "@/modules/analytics/admin-analytics.service";
import { dateRangeQuerySchema, resolveDateRange } from "@/modules/analytics/schemas";
import { handleApiError } from "@/lib/api-error";

/** GET /api/admin/analytics/by-region — orders and GMV grouped by fulfilling branch's region. Admin only. */
export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN", "SUPER_ADMIN");
    const query = dateRangeQuerySchema.parse({
      from: req.nextUrl.searchParams.get("from") ?? undefined,
      to: req.nextUrl.searchParams.get("to") ?? undefined,
    });

    const regions = await getOrdersByRegion(resolveDateRange(query));
    return NextResponse.json({ regions }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
